+++
title = '把可观测性做进 CI：一次线上故障的复盘'
linkTitle = '可观测性做进 CI'
description = '一次持续 47 分钟的线上故障，根因在 12 分钟时就已确定，却花了 35 分钟才定位到代码。复盘之后我们把 tracing 前移到了 CI。'
date = 2026-07-15
tags = ['可观测性', 'CI/CD', '故障复盘']
categories = ['工程实践']
+++

故障本身不复杂：一次配置变更导致连接池耗尽。复杂的是**我们知道哪里出问题，却花了 35 分钟才找到是哪一行代码**。
这篇复盘的重点不是根因，而是那 35 分钟。

## 时间线

| 时刻 | 事件 | 我们知道的 |
| --- | --- | --- |
| 14:02 | 部署 v2.14.3 | — |
| 14:05 | 告警：p99 延迟超过 2s | 服务变慢 |
| 14:17 | 确认连接池等待队列打满 | **根因已确定** |
| 14:52 | 找到引入问题的代码行 | 定位完成 |
| 14:58 | 回滚完成，指标恢复 | — |

从 14:17 到 14:52 的 35 分钟，全部花在「哪个变更让连接池被打满」这个问题上。
我们有的证据是：连接池指标、部署记录、以及 200 多个提交。

## 为什么定位这么慢

三个具体原因，每个都能单独修：

1. **指标没有关联到代码**。连接池的等待时长是有的，但它不知道自己在为哪条调用链服务。
2. **日志缺少结构**。`context deadline exceeded` 出现了一万四千次，没有一个是可聚合的维度。
3. **CI 只跑功能测试**。这次变更引入的连接泄漏在单元测试里完全看不见——
   它只有在真实负载下、且连接复用率足够高时才暴露。

{{< callout type="warn" title="指标的缺口不是数量问题" >}}
我们当时有 1200 多个指标。问题不是指标太少，而是**没有一个指标能回答「这段代码在真实负载下的行为」**。
再堆一千个指标也不会让那 35 分钟变短。
{{< /callout >}}

## 改动一：CI 里跑真实负载

最有效的一步是让 CI 每次合并前跑一个 3 分钟的真实负载，并且**开启全量 tracing**。
关键是这个负载要经过和线上相同的连接复用路径。

```yaml
# .github/workflows/load.yml
- name: 负载 + 全量 tracing
  run: |
    docker compose up -d --wait
    # 真实流量回放：从生产采样 5% 的请求，脱敏后作为 fixture 提交在仓库里
    ./tools/replay --fixture testdata/traffic-5pct.jsonl \
                   --duration 180s \
                   --otel-endpoint http://localhost:4317 \
                   --sample-rate 1.0
  timeout-minutes: 8

- name: 断言连接池不泄漏
  run: ./tools/assert-metric --metric pool.in_use --expect-steady
```

`--sample-rate 1.0` 是刻意的。采样会掩盖低频但致命的路径，而 CI 里的负载量小到不需要考虑开销。

## 改动二：让指标带上代码归属

我们把 OpenTelemetry 的 span 属性做了统一约定，其中一个字段是关键：

```go
// 每个出站调用都带上「发起它的代码位置」。
// 用编译期注入的 var 而不是 runtime.Caller：开销可以忽略，且不依赖符号表。
var (
    buildCommit = "unknown"
    buildPkg    = "unknown"
)

func (c *Client) Do(ctx context.Context, req *Request) (*Response, error) {
    ctx, span := tracer.Start(ctx, "client.Do",
        trace.WithAttributes(
            attribute.String("code.pkg", buildPkg),
            attribute.String("build.commit", buildCommit),
        ),
    )
    defer span.End()
    // …
}
```

这样当连接池等待队列变长时，查询从「等待时长」直接跳到「是哪几个包在等待」：

```sql
SELECT attributes['code.pkg'] AS pkg,
       count(*)               AS spans,
       quantile(0.99)(duration) AS p99
FROM spans
WHERE name = 'client.Do'
  AND attributes['pool.wait_ms'] > '500'
  AND timestamp > now() - INTERVAL 15 MINUTE
GROUP BY pkg
ORDER BY p99 DESC
LIMIT 10;
```

这次故障里，如果这条查询存在，答案会在 10 秒内出来：`internal/registry` 的 p99 是其余的 40 倍。

## 改动三：把断言写进 CI

只加 tracing 不够，还要**让 CI 在指标退化时失败**。我们加了三个断言，都很粗糙但有效：

```text
1. pool.in_use 在负载结束后 30 秒内必须回落到基线 ±5%
2. goroutine 数量在负载结束后必须回到基线 ±10%
3. 每个 span 的 code.pkg 属性必须非空
```

第三条看起来多余，但它是前两条的前提：如果归属信息缺失，前两条失败时你还是不知道该找谁。

## 效果

改动上线两个月后，同类故障（配置或代码引起的资源缓慢耗尽）共发生 3 次：

| | 改动前 | 改动后 |
| --- | --- | --- |
| 平均定位时间 | 38 分钟 | 6 分钟 |
| 平均恢复时间 | 51 分钟 | 14 分钟 |
| CI 时长增加 | — | +4 分钟 |
| 真实负载回归拦截的问题 | — | 7 个（其中 2 个会引发 P1） |

CI 多了 4 分钟，换回 24 分钟的平均恢复时间。这个交换在任何团队里都成立。

{{< terminal title="改动后的定位流程" >}}
$ ./tools/locate --since 15m --metric pool.wait_ms --threshold 500
查询 spans … 完成（0.8s）
按 code.pkg 聚合：
  internal/registry      2,140 spans   p99 3,412ms   ← 主要嫌疑
  internal/cache           312 spans   p99   180ms
  internal/http            188 spans   p99    42ms

建议：查看 internal/registry 最近 1 小时的变更
$ git log --oneline -5 -- internal/registry
a41f9c2 提高 registry 的并发度（本次部署）
3e88b71 修复重试计数
{{< /terminal >}}

## 小结

三件事按收益排序：

1. **CI 跑真实负载**（收益最大，成本 4 分钟）
2. **指标带代码归属**（决定了定位能否自动化）
3. **把断言写进 CI**（保证前两件不退化）

如果你只能做一件，做第一件。它不需要改任何核心代码，只需要一个能回放流量的 fixture。
关于用 eBPF 做无侵入采集，可以看 [从零写一个 eBPF 探针：追踪 TCP 重传](/posts/ebpf-tcp-retransmit/)。
