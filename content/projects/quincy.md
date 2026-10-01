+++
title = 'Quincy'
linkTitle = 'Quincy'
description = '一个用 Rust 写的教学向 SQL 查询引擎：手写词法分析、基于 Volcano 模型的执行器，以及一个能跑 TPC-H 前 6 条查询的向量化执行路径。'
date = 2026-02-20
weight = 30
[params]
  status = 'wip'
  stack = ['Rust', 'Arrow', 'SQL']
  repo = 'https://github.com/yourname/quincy'
  demo = ''
+++

Quincy 的目标不是性能，而是**把查询引擎的每一层都摊开写一遍**，这样读数据库论文时能对上具体代码。
目前能跑通 TPC-H 的前 6 条查询。

## 分层

```text
SQL 文本
   │  sqlparser-rs（只借词法和语法，不借语义）
   ▼
AST ──► 逻辑计划 ──► 优化 ──► 物理计划 ──► 执行
        (关系代数)   (规则)   (Volcano/向量化)
```

每一层都有自己的测试，且都能从 SQL 文本一路 `EXPLAIN` 出来。

## 已实现的优化规则

| 规则 | 说明 | TPC-H Q2 加速 |
| --- | --- | --- |
| 谓词下推 | 把过滤尽量推到扫描层 | 1.9× |
| 投影裁剪 | 只读用到的列 | 2.4× |
| 常量折叠 | 编译期算出常量表达式 | 1.02× |
| Join 重排序 | 基于基数估计，只做贪心 | 3.1× |
| 向量化执行 | 批大小 1024，配 Arrow 内存布局 | 4.8× |

规则叠加后在 TPC-H Q2（1 GB 数据集）上相对最初版本累计约 42 倍。

## 向量化执行

Volcano 模型每行一次虚函数调用，在现代 CPU 上是灾难。Quincy 的向量化路径按批处理：

```rust
/// 按批处理：一次处理 1024 行，把虚函数调用摊薄。
/// 这也是为什么 Arrow 的列式布局重要——同列数据在内存里连续，
/// 顺序扫描时预取器能正常工作。
pub trait VecOperator {
    /// 返回本批产出的行数，0 表示上游耗尽。
    fn next_batch(&mut self, batch: &mut RecordBatch) -> Result<usize>;
}

impl VecOperator for FilterExec {
    fn next_batch(&mut self, batch: &mut RecordBatch) -> Result<usize> {
        loop {
            let n = self.child.next_batch(batch)?;
            if n == 0 {
                return Ok(0);
            }
            let mask = self.predicate.eval(batch)?;
            let kept = batch.filter(&mask);
            if kept > 0 {
                return Ok(kept);
            }
            // 全被过滤掉：继续向上游要下一批，而不是返回 0（返回 0 会被当成结束）。
        }
    }
}
```

上面那个注释是踩过的坑：**「本批 0 行」和「上游耗尽」必须区分开**，
否则过滤选择性高的时候查询会提前返回不完整结果。

## 快速开始

{{< terminal title="TPC-H Q2" >}}
$ git clone https://github.com/yourname/quincy && cd quincy
$ cargo build --release
$ ./target/release/quincy load --tpch --sf 1 --data-dir ./data

$ ./target/release/quincy explain --file queries/q2.sql
Projection [p_partkey]
  Sort [p_partkey]
    Filter [p_size = 15 AND p_type LIKE '%BRASS']
      HashJoin [p_partkey = ps_partkey]
        Scan parts  (rows≈200000, cols=3)
        HashJoin [ps_suppkey = s_suppkey]
          Scan partsupp (rows≈800000, cols=4)
          Filter [s_region = 'EUROPE']
            Scan supplier (rows≈10000, cols=2)

$ ./target/release/quincy run --file queries/q2.sql
1 row · 4.21s
{{< /terminal >}}

## 现状

- [x] 词法 / 语法（借 sqlparser-rs）
- [x] 逻辑计划与 5 条优化规则
- [x] Volcano 执行器
- [x] 向量化执行（批 1024）
- [x] TPC-H Q1–Q6
- [ ] 基于直方图的基数估计（现在是硬编码的选择率）
- [ ] Hash Join 的溢出到磁盘
- [ ] 窗口函数

{{< callout type="info" title="刻意不做的事" >}}
Quincy 不做事务、不做并发控制、不做崩溃恢复。加上它们会让代码量翻三倍，
而这三块有更好的教学材料（比如 BusTub）。Quincy 只专注于查询这一层。
{{< /callout >}}
