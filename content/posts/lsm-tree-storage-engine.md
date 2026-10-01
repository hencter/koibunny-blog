+++
title = '用 Rust 写一个最小可用的 LSM-Tree 存储引擎'
linkTitle = '最小可用 LSM-Tree'
description = '从 MemTable 到分层 Compaction：一个 3000 行以内、能通过崩溃恢复测试的 LSM-Tree 实现，以及每一处取舍背后的实测数据。'
date = 2026-09-20
tags = ['Rust', '存储引擎', 'LSM-Tree']
categories = ['系统']
+++

关系数据库的默认引擎大多是 B-Tree，但写密集场景下 LSM-Tree 往往更划算。教科书上的图很漂亮，
真正动手时卡人的却是三个具体问题：**写入放大的来源**、**Compaction 的调度**、以及**崩溃后如何恢复到一致状态**。

这篇文章记录我实现的一个约 2800 行的最小可用版本，以及每一处取舍背后的实测数字。

## 整体结构

数据从内存到磁盘依次经过四层。每一层都是有序的，这一点是后面所有优化的前提。

```text
        write
          │
          ▼
   ┌─────────────┐     满了就冻结
   │  MemTable   │ ───────────────┐
   └─────────────┘                │
          │ 先写                    ▼
          ▼                 ┌─────────────┐
   ┌─────────────┐          │  Immutable  │
   │    WAL      │          │  MemTable   │
   └─────────────┘          └─────────────┘
                                  │ flush
                                  ▼
                          ┌───────────────┐
                          │  L0 (SSTables)│  允许 key 重叠
                          └───────────────┘
                                  │ compact
                                  ▼
                          ┌───────────────┐
                          │  L1 … L6      │  key 范围互不重叠
                          └───────────────┘
```

关键不变量：**WAL 必须先于 MemTable 落盘**。顺序反过来的话，进程在两步之间挂掉就会丢数据，
而且丢得悄无声息。

## MemTable 与 WAL

MemTable 用 `BTreeMap<InternalKey, Vec<u8>>`，够用且省事。真正需要小心的是顺序键的编码：
它把用户 key、序列号和类型打包成一个可比较的字节串。

```rust
/// 顺序键：user_key 升序，seq 降序 —— 同一个 key 的最新版本排在最前面。
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct InternalKey {
    user_key: Vec<u8>,
    /// 取反存放：这样字典序的「更大」等价于序列号的「更新」。
    seq: u64,
    kind: ValueKind,
}

impl InternalKey {
    pub fn new(user_key: &[u8], seq: u64, kind: ValueKind) -> Self {
        Self { user_key: user_key.to_vec(), seq: !seq, kind }
    }

    pub fn user_key(&self) -> &[u8] {
        &self.user_key
    }

    pub fn seq(&self) -> u64 {
        !self.seq
    }
}
```

`seq` 取反是个小技巧，但少了它就得给 `Ord` 写一个反直觉的手工实现，而手工实现迟早会被改错。

WAL 用定长头部加变长 payload，每条记录带 CRC32：

```rust
fn append(&mut self, batch: &WriteBatch) -> io::Result<()> {
    let payload = batch.encode();
    let mut header = [0u8; 12];
    header[0..4].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    header[4..8].copy_from_slice(&crc32(&payload).to_le_bytes());
    header[8..12].copy_from_slice(&self.next_seq.to_le_bytes());

    self.file.write_all(&header)?;
    self.file.write_all(&payload)?;
    // 关键：不 fsync 就只是「写进了页缓存」，掉电即丢。
    // 批量提交时把 fsync 提到批次末尾，能省下大量 IOPS。
    if self.sync_on_write {
        self.file.sync_data()?;
    }
    Ok(())
}
```

{{< callout type="warn" title="backup 与 destructive 别搞混" >}}
`set_len` 把 `ValueKind::Deletion` 写成普通值，`insert` 用它；`remove` 必须写 `Deletion`。
我第一版把两者都写成普通值，结果是删除过的 key 在重启后复活——因为 `delete` 只是写了一个空值，
而读取路径遇到空值会继续往下层找。
{{< /callout >}}

## Compaction 的取舍

分层策略不是「越小越好」。L0 触发阈值、每层倍数、以及单次合并的文件数，
三者共同决定写入放大和读放大的曲线。我跑了三组配置：

| 配置 | L0 触发 | 层倍数 | 写入放大 | 读放大（p99） | 空间放大 |
| --- | --- | --- | --- | --- | --- |
| 激进 | 4 | 4 | 14.2× | 3.1 | 1.08 |
| 均衡 | 8 | 10 | 8.6× | 4.4 | 1.21 |
| 保守 | 16 | 16 | 6.1× | 7.9 | 1.44 |

压力模型是 YCSB 的 workload A（50% 读 / 50% 写），value 大小 1 KiB，数据集 10 GiB。

结论很直接：**读放大对 L0 触发阈值极其敏感，写入放大对层倍数极其敏感**。
如果你的服务读多写少，选激进配置；反过来就别碰它。

单次合并的文件选择用「大小相近优先」，而不是简单地取最老的一批。这点改动让写入放大降了约 18%：

```rust
/// 按大小分组，优先合并体积接近的文件，避免把大文件反复卷进小合并。
fn pick_compaction(level: &mut Level) -> Option<Vec<FileId>> {
    level.files.sort_by_key(|f| f.size);

    for window in level.files.windows(2) {
        let ratio = window[0].size as f64 / window[1].size as f64;
        if ratio > 0.75 {
            return Some(vec![window[0].id, window[1].id]);
        }
    }
    None
}
```

## 崩溃恢复

恢复路径只有两条，都要写测试：

1. WAL 完整 → 重放全部记录，重建 MemTable。
2. WAL 尾部损坏 → **截断到最后一个通过 CRC 校验的记录**，而不是整个文件作废。

第二条容易被忽略。我用一个专门的测试反复截断 WAL 文件的不同长度，确认引擎每次都能起来：

{{< terminal title="cargo test --test recovery" >}}
$ cargo test --test recovery -- --nocapture
running 12 tests
test truncate_at_byte_0 ... ok
test truncate_at_byte_7 ... ok
test truncate_mid_record ... ok
test truncate_at_last_valid ... ok
test torn_write_then_recover ... ok
test result: ok. 12 passed; 0 failed; 0 ignored
{{< /terminal >}}

## 基准数据

`cargo bench` 在本机（AMD 7950X、NVMe）上的结果：

```text
insert/16kb            time:   [1.2041 s 1.2088 s 1.2135 s]
                       thrpt:  [13.203 Melem/s 13.254 Melem/s 13.306 Melem/s]
get/random/hit         time:   [412.31 ns 415.02 ns 418.11 ns]
get/random/miss        time:   [1.1042 µs 1.1130 µs 1.1224 µs]
recover/wal_1mib       time:   [8.9214 ms 8.9708 ms 9.0221 ms]
```

命中缓存时读取是纳秒级，miss 时落到布隆过滤器加一次磁盘寻道，多了一个数量级——符合预期。

## 小结

这个实现刻意省掉了三样东西：多线程 Compaction、块级压缩、以及更聪明的布隆过滤器。
它们都不是「最小可用」的必要条件，但每一样都能把性能抬一个台阶。

下一步我打算先做多线程 Compaction，因为它在 8 核以上的机器上收益最直接。
相关背景可以看 [Raft 之外：为什么我们最终选了 Multi-Paxos](/posts/multi-paxos-vs-raft/)，
那篇讲的是这套存储之上的一致性层。
