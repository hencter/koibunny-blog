+++
title = 'dsh-tools'
linkTitle = 'dsh-tools'
description = '内部开发者工具集：仓库级别的增量构建调度、测试影响分析、以及一个把 CI 反馈时间从 14 分钟压到 4 分钟的任务图执行器。'
date = 2025-11-08
weight = 40
[params]
  status = 'archived'
  stack = ['Go', 'TypeScript', 'Bazel 思路']
  repo = 'https://github.com/yourname/dsh-tools'
  demo = ''
+++

dsh-tools 是我在一个 200 人工程团队里做的开发者工具集。它解决的问题很具体：
**CI 反馈时间 14 分钟，其中 11 分钟在跑和本次改动无关的测试。**

项目现已归档，因为团队后来迁移到了 Bazel，内置的能力覆盖了这些脚本。但里面的两个思路值得留下记录。

## 思路一：测试影响分析

从改动文件出发反向查询依赖图，只跑可能受影响的测试：

```go
// 反向依赖：从改动文件出发，向上找到所有依赖它的测试目标。
func (g *Graph) AffectedTests(changed []string) []Target {
    seen := map[string]bool{}
    queue := append([]string{}, changed...)

    for len(queue) > 0 {
        cur := queue[0]
        queue = queue[1:]
        if seen[cur] {
            continue
        }
        seen[cur] = true
        // 反向边：谁依赖了我
        queue = append(queue, g.ReverseDeps[cur]...)
    }

    var tests []Target
    for path := range seen {
        if t, ok := g.Targets[path]; ok && t.IsTest {
            tests = append(tests, t)
        }
    }
    return tests
}
```

关键在于**依赖图必须来自构建系统，而不是靠正则解析 import**。
我们第一版用正则扫 `import`，漏掉了通过配置文件、代码生成和插件注册产生的依赖，
导致 12% 的改动漏跑测试。这个数字是统计「改动后 CI 通过但再次提交修复」的比例得到的。

## 思路二：保守回退

影响分析一定会漏。所以 dsh-tools 有两条硬规则：

1. **改动涉及公共库、构建脚本或 CI 配置时，全量跑**，不做任何分析。
2. **最近 50 次提交内出现过 CI 逃逸的包，永久加入全量列表**，由人工移出。

第二条听起来很粗暴，实际上非常有效：它把「分析错误」的代价从「线上故障」降级成「CI 慢一点」。

## 实测效果

| 指标 | 改造前 | 改造后 |
| --- | --- | --- |
| CI 反馈时间（p50） | 14.2 min | 4.1 min |
| CI 反馈时间（p95） | 21.8 min | 7.6 min |
| 漏跑导致的修复提交 | — | 0.4%（全量回退规则兜住） |
| CI 机器成本 | 100% | 46% |

## 为什么归档

三点原因：

- **Bazel 内置了这整套能力**，而且依赖图来自真实构建图，比我们维护的准确。
- **需要长期维护依赖图解析器**，每加一种新语言就要写一份，成本不收敛。
- **它是 CI 的强耦合组件**。它挂了 CI 就完全跑不了，而这个风险不该由一个内部脚本承担。

{{< callout type="warn" title="教训" >}}
用一个自研脚本去优化 CI，收益来得快，但你会永远持有它。
在动手之前先确认：构建系统本身是不是已经提供了这个能力，只是没人配置。
{{< /callout >}}

{{< callout type="info" title="相关文章" >}}
这套工具怎么和可观测性配合，写在 [把可观测性做进 CI：一次线上故障的复盘](/posts/observability-in-ci/)。
{{< /callout >}}
