+++
title = 'Helios'
linkTitle = 'Helios'
description = '用 Rust 写的分布式对象存储：Multi-Paxos 共识层、LSM-Tree 存储层，支持按租户动态扩缩副本。'
date = 2026-05-01
weight = 10
[params]
  status = 'active'
  stack = ['Rust', 'gRPC', 'RocksDB', 'Multi-Paxos']
  repo = 'https://github.com/yourname/helios'
  demo = ''
+++

Helios 是一个面向小文件（平均 40 KiB）的分布式对象存储。目标不是替代 S3，
而是在**单集群、多租户、需要频繁调整副本数**的场景下给出可预测的尾延迟。

## 为什么又写一个

现有方案在我们的场景里各差一点：

- **Ceph**：功能完整，但 RADOS 的调优参数有几百个，我们的运维规模撑不起。
- **MinIO**：单层部署简单，但副本数（纠删码配置）变更需要重建整个池子。
- **自研 Raft 方案**：成员变更在我们需要的频率下会成为写入瓶颈。

核心诉求只有一条：**租户的副本数可以在线改，且改的过程中写入不中断**。

## 架构

```text
        Client (S3 兼容 API)
                │
        ┌───────▼────────┐
        │   Gateway      │  ── 路由 + 鉴权 + 限流
        └───────┬────────┘
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐
│Shard 1 │ │Shard 2 │ │Shard N │   ── 按 tenant+key 分片
├────────┤ ├────────┤ ├────────┤
│ Paxos  │ │ Paxos  │ │ Paxos  │   ── 每分片一个共识组
├────────┤ ├────────┤ ├────────┤
│ LSM    │ │ LSM    │ │ LSM    │   ── 每副本一个本地引擎
└────────┘ └────────┘ └────────┘
```

分片之间完全独立：一个租户的副本变更不影响其他分片。这是「按租户动态扩缩」能成立的前提。

## 关键设计

### 副本变更是普通日志条目

新配置作为一条普通日志写入，生效点是日志里的确定位置：

```rust
pub enum Entry {
    /// 普通数据写入
    Data { key: Bytes, value: Bytes },
    /// 配置变更：复制到多数派后，在 apply 阶段生效
    ConfigChange { shard: ShardId, replicas: Vec<NodeId> },
    /// 租户元数据
    TenantMeta { tenant: TenantId, quota: Quota },
}
```

这样就没有「配置变更窗口」：任何时刻都只有一份有效配置，只是它可能位于日志的某个位置。

### 读路径必须等待依赖

Multi-Paxos 的乱序提交意味着，看到 slot 14 已提交并不代表 slot 13 也提交了。
读之前必须显式确认依赖链：

```rust
async fn read(&self, key: &[u8]) -> Result<Option<Bytes>> {
    let index = self.next_slot();
    // 读屏障：先把当前 Leader 的提交点推到一个确定的 slot，
    // 再等该 slot 之前的所有依赖都 apply 完成。
    self.replicate_noop(index).await?;
    self.wait_dependencies(index).await?;
    self.state_machine().get(key)
}
```

## 快速开始

{{< terminal title="本地三节点集群" >}}
$ git clone https://github.com/yourname/helios && cd helios
$ cargo build --release
$ ./target/release/helios-node --config examples/three-node/node1.toml &
$ ./target/release/helios-node --config examples/three-node/node2.toml &
$ ./target/release/helios-node --config examples/three-node/node3.toml &

$ ./target/release/helios-ctl status
shard 0  leader=node1  replicas=3  committed=1,204,881  lag=0
shard 1  leader=node3  replicas=3  committed=  881,042  lag=0
cluster healthy
{{< /terminal >}}

## 性能

1000 万对象、3 副本、每对象 40 KiB，单分片：

| 操作 | p50 | p99 | p99.9 |
| --- | --- | --- | --- |
| PUT | 9.8 ms | 21.7 ms | 46 ms |
| GET（本地副本） | 0.4 ms | 1.2 ms | 3.1 ms |
| GET（远端副本） | 2.1 ms | 6.4 ms | 18 ms |
| 副本变更（3→5） | 0.34 s | — | — |

## 现状与路线图

- [x] Multi-Paxos 共识层与崩溃恢复
- [x] LSM-Tree 存储引擎（含 WAL 尾部截断恢复）
- [x] 按租户在线调整副本数
- [x] S3 兼容的 GET / PUT / DELETE
- [ ] 后台纠删码（降低冷数据的空间放大约 40%）
- [ ] 跨集群异步复制

{{< callout type="info" title="相关文章" >}}
共识层的选型经过写在 [Raft 之外：为什么我们最终选了 Multi-Paxos](/posts/multi-paxos-vs-raft/)，
存储引擎的实现细节在 [用 Rust 写一个最小可用的 LSM-Tree 存储引擎](/posts/lsm-tree-storage-engine/)。
{{< /callout >}}
