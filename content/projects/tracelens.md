+++
title = 'TraceLens'
linkTitle = 'TraceLens'
description = '基于 eBPF 的无侵入可观测性采集器：从内核直接取 TCP 重传、连接建立延迟与调度延迟，不重启业务进程。'
date = 2026-03-12
weight = 20
[params]
  status = 'active'
  stack = ['C', 'eBPF', 'Go', 'OpenTelemetry']
  repo = 'https://github.com/yourname/tracelens'
  demo = 'https://tracelens-demo.example.com'
+++

TraceLens 从内核直接采集三类信号，全程不需要重启业务进程，也不需要加载任何语言 SDK：

- **网络**：TCP 重传、RTO 退避、连接建立延迟、连接被拒
- **调度**：运行队列等待时间、CPU 迁移次数、被抢占次数
- **内存**：major/minor page fault、直接回收耗时

输出走 OpenTelemetry 协议，可以直接进现有的 tracing 后端。

## 为什么不用 SDK

语言 SDK 的覆盖面永远是滞后的，而且有三个绕不过去的问题：

1. **需要改代码和重启**。对一个跑了三个月的进程来说，这个代价经常高到不可接受。
2. **看不到内核侧**。SDK 能告诉你「这次请求慢」，但没法告诉你「因为 TCP 重传了 4 次」。
3. **无法采集别人的进程**。第三方二进制、数据库、甚至 JVM 进程，SDK 都插不进去。

eBPF 都能覆盖，代价是需要内核 5.8+（ring buffer）和 BTF 支持。

## 采集概览

{{< terminal title="tracelens --summary" >}}
$ sudo tracelens --pid 18422 --duration 60s --summary
采集 60s，pid=18422 (envoy)
  跟踪的连接            1,204
  出站 span             38,441

网络
  重传                  1,104  (2.87%)
  RTO 退避进入          312
  握手 p99              18.4 ms
  accept 队列溢出        0

调度
  运行队列等待 p99      1.8 ms
  CPU 迁移              4,120 次
  被抢占 p99            0.9 ms

内存
  major fault            18
  minor fault        22,104
  直接回收 p99          12.4 ms   ← 值得关注
{{< /terminal >}}

`直接回收 p99 = 12.4 ms` 这一行是 TraceLens 最常抓到的真实问题：
它解释了「为什么 p99 延迟会突然跳一下」，而应用侧的任何指标都看不到它。

## 设计取舍

### 用 ring buffer，不用 perf buffer

内核 5.8+ 的 ring buffer 所有 CPU 共享一块内存，事件顺序天然一致，内存占用固定。
perf buffer 需要每 CPU 一个缓冲区，用户态还得重排序。新代码没有理由再用它。

### 采样在 BPF 侧做

把采样决策放进内核，避免无谓的事件传输：

```c
// 1/64 采样：高流量下这是唯一的办法。
// 采样率写进 map，用户态可以运行时调整，不需要重新加载程序。
__u64 *rate = bpf_map_lookup_elem(&config, &KEY_SAMPLE_RATE);
if (rate && (bpf_get_prandom_u32() % *rate) != 0) {
    return 0;
}
```

### 符号解析离线做

内核侧只记录地址，用户态批量解析符号。这样 BPF 程序保持极小，
也避免了在软中断上下文里做字符串操作。

## 开销

在 20 Gbps 网卡、16 核机器上，全量采集（采样率 1/64）：

| 采集范围 | CPU 占用 | 内存 | 丢事件率 |
| --- | --- | --- | --- |
| 仅网络 | 1.2% | 48 MiB | 0.00% |
| 网络 + 调度 | 2.8% | 64 MiB | 0.01% |
| 全量 | 3.5% | 96 MiB | 0.07% |

## 现状

- [x] TCP 重传 / RTO / 握手延迟
- [x] 调度延迟与 CPU 迁移
- [x] page fault 与直接回收
- [x] OTLP 导出
- [x] 运行时调整采样率
- [ ] 容器网络命名空间的自动发现
- [ ] 基于 BTF 的跨内核版本兼容层

{{< callout type="warn" title="内核版本要求" >}}
ring buffer 需要内核 5.8+，CO-RE 需要 BTF（`CONFIG_DEBUG_INFO_BTF=y`）。
在 4.x 内核上只能用 perf buffer，内存占用会随 CPU 数线性增长，不建议在生产环境使用。
{{< /callout >}}

实现细节从 [从零写一个 eBPF 探针：追踪 TCP 重传](/posts/ebpf-tcp-retransmit/) 开始看。
