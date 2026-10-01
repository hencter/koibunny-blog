+++
title = '从零写一个 eBPF 探针：追踪 TCP 重传'
linkTitle = 'eBPF 追踪 TCP 重传'
description = '不用 tcpdump、不改内核、不重启业务：用 eBPF 加上 kprobe 追踪每一次 TCP 重传，并说明为什么 ring buffer 比 perf buffer 更值得选。'
date = 2026-04-18
tags = ['eBPF', 'Linux', '网络']
categories = ['系统']
+++

排查网络问题时 `tcpdump` 通常是第一选择，但它有个根本限制：**你只能看到包，看不到内核为什么重传**。
重传计数器 `TCPRetransSegs` 是个全局数字，它不告诉你哪条连接、哪个进程、在什么条件下重传。

eBPF 能补上这块。这篇文章从零写一个探针，追踪每一次重传并带上进程上下文。

## 为什么选 kprobe 而不是 tracepoint

内核已经在 `tcp_retransmit_skb` 上提供了 tracepoint（`tracepoint:tcp/tcp_retransmit_skb`），
但它的参数里没有我们想要的**重传原因**。kprobe 可以挂到函数入口，直接读寄存器里的参数。

代价是 kprobe 依赖内核符号，属于「不稳定接口」。我的做法是：
**用 tracepoint 做主路径，kprobe 只用来补充原因字段**，这样任意一个失效都不会让整个探针挂掉。

## 探针实现

内核侧用 C 写，通过 `bpf_ktime_get_ns` 记录时间，把事件推给用户态。

```c
// tcp_retransmit.bpf.c
#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>

struct retrans_event {
    __u64 ts_ns;
    __u32 saddr;
    __u32 daddr;
    __u16 sport;
    __u16 dport;
    __u32 seq;
    __u32 pid;
    __u32 retrans_count;
    __u8  state;
    char  comm[16];
};

// ring buffer 是内核 5.8+ 的推荐接口：所有 CPU 共享一个缓冲区，
// 事件顺序天然一致，也不需要为每个 CPU 单独轮询。
struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24); // 16 MiB
} events SEC(".maps");

SEC("tracepoint/tcp/tcp_retransmit_skb")
int handle_retransmit(struct trace_event_raw_tcp_event_sk_skb *ctx)
{
    struct retrans_event *e;
    struct sock *sk = ctx->sk;
    struct tcp_sock *tp = (struct tcp_sock *)sk;

    e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) {
        // 缓冲区满：这里必须直接返回，不能改成 bpf_ringbuf_output，
        // 否则高负载下会自己把自己打爆。
        return 0;
    }

    e->ts_ns = bpf_ktime_get_ns();
    BPF_CORE_READ_INTO(&e->saddr, sk, __sk_common.skc_rcv_saddr);
    BPF_CORE_READ_INTO(&e->daddr, sk, __sk_common.skc_daddr);
    e->sport = BPF_CORE_READ(sk, __sk_common.skc_num);
    e->dport = bpf_ntohs(BPF_CORE_READ(sk, __sk_common.skc_dport));
    e->seq = BPF_CORE_READ(tp, snd_nxt);
    e->pid = bpf_get_current_pid_tgid() >> 32;
    e->state = BPF_CORE_READ(sk, __sk_common.skc_state);
    bpf_get_current_comm(&e->comm, sizeof(e->comm));

    // 每条连接的重传次数：用 socket 指针做 key，连接关闭后由 GC 清理。
    __u32 *cnt = bpf_map_lookup_or_try_init(&retrans_count, &sk, &( __u32){0});
    if (cnt) {
        e->retrans_count = ++(*cnt);
    }

    bpf_ringbuf_submit(e, 0);
    return 0;
}
```

`bpf_ringbuf_reserve` 返回 NULL 时必须**放弃这条事件**，而不是回退到 `bpf_ringbuf_output`。
后者会内部分配内存，在缓冲区已经满的情况下只会让情况更糟——这是我第一版直接导致系统 OOM 的原因。

## 用户态

用户态用 Go 的 `cilium/ebpf` 库读 ring buffer：

```go
func (p *Probe) Run(ctx context.Context) error {
    rd, err := ringbuf.NewReader(p.objs.Events)
    if err != nil {
        return fmt.Errorf("打开 ring buffer: %w", err)
    }
    defer rd.Close()

    // ring buffer 的读取必须在同一个 goroutine 里串行进行，
    // 多 goroutine 并发读会打乱顺序也拿不到额外吞吐。
    for {
        rec, err := rd.Read()
        if err != nil {
            if errors.Is(err, ringbuf.ErrClosed) {
                return nil
            }
            continue
        }

        var evt retransEvent
        if err := binary.Read(bytes.NewReader(rec.RawSample), binary.LittleEndian, &evt); err != nil {
            continue
        }
        p.emit(evt)
        rd.Drain(1) // 一次性收割更多，降低 syscall 次数
    }
}
```

{{< callout type="tip" title="ring buffer vs perf buffer" >}}
内核 5.8 之前只能用 perf buffer，它的问题是**每个 CPU 一个缓冲区**：
事件顺序需要用户态重新排序，内存占用是 CPU 数的倍数，而且单个 CPU 的缓冲区满了就丢事件。

ring buffer 所有 CPU 共享一块内存，顺序天然是提交顺序，内存占用固定。
新代码没有理由再用 perf buffer。
{{< /callout >}}

## 实测：重传到底长什么样

在一次真实的高丢包网络里采样 10 分钟（`tc netem loss 2%`）：

{{< terminal title="retrans-probe --top" >}}
$ sudo ./retrans-probe --duration 10m --top
采样 10m0s，捕获 18,442 次重传

按进程排序（重传次数 / 涉及连接数）：
  envoy              11,204 / 340
  postgres             3,881 /  22
  retrans-probe           41 /   1   ← 探针自己也会重传

重传间隔分布（同一条连接内相邻两次）：
  0–10ms      31%
  10–100ms    24%
  100ms–1s    19%
  1s–3s       21%
  > 3s         5%

RTO 退避确认：初值 200ms，指数退避到 1.6s 后稳定
{{< /terminal >}}

最有价值的观察是最后一行。**21% 的重传间隔在 1 秒到 3 秒之间**，说明这些连接已经进入了
持续退避状态——这不是随机丢包，而是链路长期拥塞。仅凭 `TCPRetransSegs` 计数器看不到这个区分。

## 几个坑

1. **`vmlinux.h` 必须和目标内核一致**。容器里编译、宿主机运行的话，用
   `bpftool btf dump file /sys/kernel/btf/vmlinux format c` 在宿主机生成。
2. **`bpf_get_current_comm` 在软中断上下文里返回的是 `ksoftirqd`**，不是真实进程。
   重传恰好经常发生在软中断里，所以进程归属要看 `sk` 上的 socket，而不是当场的 `comm`。
3. **map 里的 socket 指针会变成悬垂**。连接关闭后内存可能被复用。我们用一个
   `sock_ops` 程序在 `BPF_SOCK_OPS_STATE_CB` 里删除对应条目。

{{< callout type="danger" title="生产环境的开销" >}}
在 20 Gbps 的网卡上，这个探针占用约 3.5% 的一个核心。如果你的重传率很高，
ring buffer 会成为瓶颈。上线前务必先用 `--duration 30s` 在小流量机器上量一次实际开销。
{{< /callout >}}

## 小结

eBPF 在这里的价值不是「比 tcpdump 更快」，而是**能同时看到包和产生包的内核状态**。
重传原因、拥塞窗口、socket 归属这些信息，抓包永远拿不到。

这套采集器的完整实现（包括 `sock_ops` 清理和指标导出）在 [tracelens](/projects/tracelens/) 项目里。
它采集的数据怎么进 CI 做回归，可以看 [把可观测性做进 CI](/posts/observability-in-ci/)。
