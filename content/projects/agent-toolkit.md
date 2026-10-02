+++
title = 'Agent 工作流工具集'
linkTitle = 'Agent 工具集'
description = '四个自用的代理技能：把微信群聊提炼成飞书日报、给 Windows 版 Codex 换界面皮肤、批量归档飞书文档、以及可灵 AI 生成能力的命令行封装。'
date = 2026-09-28
weight = 20
[params]
  status = 'wip'
  stack = ['Agent Skills', 'PowerShell', 'Node.js', '飞书 API', '可灵 MCP']
  repo = ''
  demo = ''
+++

这四样东西都是我每天在用的工具，形态是**代理技能**（Agent Skill）：一个 `SKILL.md`
描述流程与边界，旁边的脚本做确定性操作。

技能这种形态有个好处：模型负责判断，脚本负责重复劳动。凡是能用脚本一次做对的事，
就不该交给模型每次重新推一遍。

## wxgroupinsight：群聊 → 飞书日报

把指定微信群的当日消息与图片，提炼成一份给人**精读**的飞书文档，目标是减少爬楼焦虑。
只留值得带走的内容：技巧、经验、坑、breaking news、方法论；画像、流水账、争论叙事一律不写。

数据流是一条直线，中间没有模型能自由发挥的空间：

```text
微信 4.x 本地数据库
   │  wx-cli 的 wx history / wx attachments
   ▼
scripts/extract-images.sh      绕开 macOS 上 .dat 还原的盲点
   ▼
Claude                          三轮生成：骨架 → 正文 → 审计
   ▼
{日期}.md + images/{日期}/      中间产物，可复查
   ▼
lark-cli docs +update / +media-insert / +fetch
   ▼
飞书 docx 日报
```

三个踩过的坑，都写进了故障速查表：

- `wx extract` 在 macOS 上抓不到本地 `.dat`，因为文件名带 `_M.dat` 后缀；
- `lark-cli docs +media-insert` 拒绝绝对路径，必须先 `cd` 到图片目录用相对路径；
- 图片 token 在飞书每次更新后会被重新分配，复用前得先 `fetch` 拿最新值。

{{< callout type="warn" title="发布前必须先做数据分离" >}}
工作目录里躺着真实的群 ID、群昵称、聊天记录和图片。
能分享的只有代码那一层，所以我把可发布的部分拆到了独立的 `wxgroupinsight-share/` 子目录，
聊天归档目录 `wechat/` 进 `.gitignore`。
先拆分再 `git init`——反过来的话，聊天记录会直接躺在历史里，之后清理要重写提交。
{{< /callout >}}

## Codex Skin Manager：给 Windows 桌面版换皮肤

官方 Codex 桌面应用不支持换背景图。这个技能做了四件事：兼容性检查、版本感知的 ASAR 定位、
自动备份、精确还原。命令面很小：

```powershell
.\scripts\skin.ps1 status
.\scripts\skin.ps1 patch  -Image "C:\path\picture.jpg" -Opacity 0.32 -Blur 0 -Fit cover
.\scripts\skin.ps1 switch -Image "C:\path\another.png" -Opacity 0.25 -Blur 2
.\scripts\skin.ps1 restore
```

`switch` 和 `restore` 是分开的命令，不是同一个参数：备份是唯一的退路，
所以「换一张」和「回到原样」必须是两条不可混淆的路径。

顺序上有一条硬规矩：**先 `status` 再 `patch`**。Codex 每次升级都会重置 ASAR，
升级后直接 `patch` 会让你以为补丁生效了，实际打在旧包上。技能里明确写了：
不许手工编辑 `app.asar`，不许接管 WindowsApps 权限，不许关闭包校验——
碰到系统拦截就停下报告，而不是削弱系统保护。

## 飞书文档归档

批量拉取一个飞书空间里的文档，做去重、交叉核对、按类型归类，
输出成可直接入库的 JSON。脚本是 Node.js 写的，按用途拆成独立文件：
拉取、去重、交叉核对、最终检查各有各的入口，出了问题能立刻定位到哪一步。

## 可灵命令行封装

可灵 AI 的文生图 / 参考图生图 / 文生视频 / 图生视频，通过 MCP 服务调用。
技能本身区域中立（国内站与海外站主页不同），模型与参数规格由 `who_am_i` 动态声明，
而不是写死在文档里——这样服务端换了模型，技能不需要跟着改。

## 现状

- [x] wxgroupinsight 全流程 + 故障速查表（依赖 wx-cli ≥ 0.2.0、lark-cli）
- [x] Codex Skin Manager 四个动作（status / patch / switch / restore）
- [x] 飞书文档批量归档
- [x] 可灵 AI 命令行封装
- [ ] 四个技能统一补 LICENSE
- [ ] 拆到独立仓库，目前散在三个工作目录里
