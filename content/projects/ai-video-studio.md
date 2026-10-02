+++
title = 'AI Video Studio'
linkTitle = 'AI Video Studio'
description = '暗黑影视工作站风格的 AI 视频创作平台：从剧本、分镜、素材到成片的一条链路，Next.js 15 + Prisma + Supabase 全栈实现。'
date = 2026-05-13
weight = 30
[params]
  status = 'wip'
  stack = ['Next.js 15', 'React 19', 'TypeScript', 'Prisma', 'Supabase', 'Tailwind']
  repo = ''
  demo = ''
+++

AI Video Studio 想把「一个想法 → 一条片子」的过程收进一个工作区里：
剧本生成 → 分镜设计 → 图片素材 → 视频素材 → 时间轴 → 项目管理 → 作品分享。

它解决的不是「AI 能不能生成画面」，而是**生成出来的东西往哪儿放、怎么改、怎么复用**。
单独用聊天窗口生成几段素材谁都会，难的是第七次修改时还能找到第一版。

## 技术选型

| 层 | 技术 |
| --- | --- |
| 前端 | Next.js 15 App Router / React 19 / TypeScript |
| 样式 | TailwindCSS / shadcn-ui / Framer Motion |
| 状态 | Zustand + React Query |
| 后端 | Next.js Server Actions / Supabase |
| 数据 | PostgreSQL + Prisma |
| AI | OpenAI / Claude / Replicate SDXL / Runway / Kling |
| 部署 | Vercel / Supabase / Cloudflare |

选 Server Actions 而不是单独的后端服务，是为了让「一次生成」这种长链路操作
不必在前端和后端之间来回定义接口。

## 工作区拆分

```
app/(marketing)/     落地页、隐私与条款
app/(auth)/          登录、注册
app/(app)/dashboard  项目列表与工作台
app/(community)/     作品流、帖子、个人主页
components/
  editor/            剧本编辑器、小说分析
  storyboard/        分镜画布
  timeline/          时间轴
  assets/            生成素材与上传素材
```

`(marketing)` `(auth)` `(app)` `(community)` 是四个路由组：
它们共享一个根布局，但各自有自己的 loading 与 error 边界。
这样工作台里一次生成失败，不会把落地页也带崩。

## Demo 模式

项目可以在没有数据库的情况下跑完整条链路：内存存储换成 JSON 文件持久化，
十几个 Server Action 统一接自动保存，重启服务不丢数据。

{{< callout type="info" title="为什么要有 Demo 模式" >}}
一个要接五种外部 AI 服务、还要建库的平台，最难的一步是**让别人第一次就能跑起来**。
Demo 模式把「配置成本」和「验证想法」这两件事拆开了：
先看清楚流程对不对，再去配 Key。
{{< /callout >}}

## 现状

- [x] 账号体系与中间件路由保护
- [x] 剧本编辑器：全字段可编辑、版本历史、内联重命名
- [x] 上传小说并分析世界观 / 角色 / 大纲 / 场景
- [x] 分镜生成与分镜画布
- [x] 素材模块：生成素材、上传素材、批量下载
- [x] Demo 模式（无需数据库）
- [ ] 时间轴与成片导出
- [ ] 多租户与团队协作权限
- [ ] 换成真实 AI 服务的成本面板（先知道要花多少钱）
