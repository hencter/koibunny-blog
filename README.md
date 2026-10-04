# Koibunny

一个 Hugo 静态站点：**像素画 / 暖色风格**——奶油纸底、皮革棕描边、硬投影（模糊半径为 0）
的立体块，配蓝天、山、池塘、锦鲤这些纯 CSS 画的像素场景。
零第三方 JS、零位图素材、零外部字体（连 Google Fonts 都不引）。

- **Hugo**：v0.167.0（本仓库在 v0.167.0 上验证通过，见文末「验证记录」）
- **主题**：`themes/nexus`，自研，随仓库一起版本管理
- **依赖**：无。没有 npm、没有 Hugo Modules、没有外部字体
- **配色**：浅色（`color-scheme: light`），没有明暗切换开关

风格取自 `参考/koibunny-blog/`（一份静态参考页）：
顶栏的棕色皮革渐变、导航的黄色像素牌、hero 的像素画风景、
卡片的描边厚阴影、六档色相的标签 chip 都对齐了那份参考。
参考页 hero 用的是一张 3.5MB 的像素画位图，这里**没有**照搬——
`themes/nexus/assets/css/components/home.css` 里的 `.hero-scene` 用 layered background
画了同一类场景（天空条纹 / 阶梯云 / 像素山 / 池塘 / 锦鲤 / 树 / 灯笼 / 太阳）。

> 参考目录 `参考/` 本身是未纳入版本管理的素材，改完风格后可以自行删除或保留；
> 站点构建完全不依赖它（`hugo` 会忽略它，因为它不在 `content/` / `static/` / `assets/` 下）。

---

## 快速开始

本工作区已经放了一份便携版 Hugo，不需要另外安装：

```powershell
# Hugo 命令必须在站点根目录执行
cd 'E:\DeepSeekHarnessWork\博客网站'

# 本地预览（带热重载）
E:\DeepSeekHarnessWork\.tooling\hugo\hugo.exe server -D

# 生成静态站点到 public/
E:\DeepSeekHarnessWork\.tooling\hugo\hugo.exe --gc --minify
```

如果 `hugo` 已经在你自己的 PATH 上，把上面的完整路径换成 `hugo` 即可。

### 构建环境备注（2026-10-03 已修复）

`hugo` 在本机曾**不带参数**运行就崩溃，发生在加载配置阶段：

```text
ERROR failed to load config: mkdir C:\Users\<用户名>\AppData\Local\Temp\hugo_cache: Access is denied.
```

根因不是权限缺失，而是这个**目录创建动作**被本机策略拒绝：同名目录一旦存在，
Hugo 对它的读写完全正常。所以修复方式就是预建该目录（已执行，当前 `hugo` 裸跑正常）：

```powershell
New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\Temp\hugo_cache"
```

两条容易踩的关联事实：

- 该路径由 Hugo 的 `GetCacheDir` 推导，**不能用 `--cacheDir` 覆盖**——实测它会与 Hugo 内部的
  其它缓存子目录拼接成 `.hugo_cache\<站点名>`，然后报 `must resolve to an absolute directory`；
- 换机器复现时，除了预建目录，也可以把 `$env:TMPDIR` 指向任意可写位置，
  或用 `hugo --source <站点目录> --cacheDir <绝对可写目录>`。

GitHub Actions 跑在 Linux 上，与这条无关。

预览地址默认是 <http://localhost:1313/>。

> `hugo server` 的运行环境是 `development`，页面会带 `noindex, nofollow`，
> `robots.txt` 也会整站 `Disallow`。直接运行 `hugo`（不指定 `-e`）时环境是 `production`，
> 两者都会切换成允许抓取。

---

## 目录结构

```
博客网站/
├── hugo.toml                  # 站点配置：身份、菜单、日期来源、Markdown、高亮
├── archetypes/                # hugo new content 的 front matter 模板
│   ├── default.md
│   └── projects.md
├── content/
│   ├── _index.md              # 首页 front matter（title / description 供 hero 使用）
│   ├── about.md               # /about/
│   ├── posts/                 # /posts/ —— 1 篇文章 + _index.md
│   └── projects/              # /projects/ —— 5 个项目 + _index.md
├── layouts/
│   └── baseof.html            # ★ 契约层：骨架与块名，见下一节
├── static/
│   ├── favicon.svg            # 手写的矢量图标（旧版遗留，favicon.ico 优先）
│   ├── favicon.ico            # ← make-og-pixel.py 生成（16/32/48）
│   ├── favicon-256.png        # ← make-og-pixel.py 生成
│   └── images/og-default.png  # ← make-og-pixel.py 生成的像素风社交分享图
├── themes/nexus/
│   ├── hugo.toml              # 只声明 hugoVersion 约束
│   ├── layouts/               # 页面模板与 partials
│   │   ├── home.html  page.html  section.html  taxonomy.html  term.html
│   │   ├── 404.html  robots.txt
│   │   ├── _partials/         # head / header / footer / menu / 卡片 / 目录 …
│   │   │                      # 其中 site-url.html、social-url.html 专管 baseURL 前缀
│   │   └── _shortcodes/       # callout
│   └── assets/
│       ├── css/               # base + components/*，外加生成的 syntax.css
│       │                      # 像素场景与卡片封面在 components/home.css
│       └── js/main.js         # 导航、复制按钮、进度条、目录高亮
└── .github/workflows/hugo.yml # GitHub Pages 部署
```

> 首页的 `.hero` 已经把标题、副标题、导语都渲染出来了，所以 `home.html` **不再**输出
> `content/_index.md` 的正文——否则同一段话会在 hero 和下方各出现一次。
> `_index.md` 里保留 `title` / `description`，它们是 hero 的数据来源。

### 项目与文章清单

`content/projects/`（按 `weight` 排序，数字小的在前）：

| weight | 页面 | status | 仓库 |
| --- | --- | --- | --- |
| 10 | [Agent 工作流工具集](content/projects/agent-toolkit.md) | `wip` | 待拆仓 |
| 20 | [AI Video Studio](content/projects/ai-video-studio.md) | `wip` | 本地 |
| 30 | [AI 辅助做游戏](content/projects/ai-games.md) | `active` | `0127yy-cloud/ai-games` |
| 40 | [云枢 ERP 演示页](content/projects/erp-demo.md) | `wip` | 本地 |
| 50 | [剧本分镜分析脚本](content/projects/script-analysis.md) | `wip` | 本地 |

`weight` 从 10 起、步长 10，连续不留空位——前一个项目（Nova 知识库）移除后已重新编号，
避免出现「权重跳号但中间没有页面」的误导。

`content/posts/` 只剩 1 篇：

- [E 盘开源体检](content/posts/open-source-audit.md)（2026-10-03）—— 开源判据与三档清单的方法论

> 站点内容经历过三次清理，每次都是**把不属于自己的内容拿掉**：
>
> 1. 早期的 4 个项目页（`tracelens` / `quincy` / `helios` / `dsh-tools`）与全部作者身份字段是
>    虚构示例，替换为真实项目与 `koibunny` 身份；
> 2. 6 篇骨架阶段的示例长文（eBPF、Go 泛型、LSM-Tree、Multi-Paxos、CI 可观测性、Raft 选型）
>    整体删除——页面上的实测数字与故障时间线都是构造的；
> 3. Nova 项目页与配套文章删除——那套知识库不是本站作者的作品，
>    放在署自己名字的项目清单里等于占用别人的成果。
>
> 判据可以复述成一句：**能被说成「我做的」的东西才留在清单里。**
> 用别人的仓库、别人的技能包、别人的代码时，正确的位置是正文里的引用与致谢，不是项目页。

### 为什么 `layouts/` 只有一个文件

项目根的 `layouts/` 是**契约层**，只放 `baseof.html`：它定义骨架、`main` 块，
以及每个主题都必须提供的 partial 名（`head.html`、`header.html`、`footer.html`、`scripts.html`）。
所有视觉与页面结构都在 `themes/nexus/`。

这样换主题时不用动骨架：新主题只要提供上述 partial 和 `main` 块就能接上。
如果你更习惯把所有模板放在项目根 `layouts/` 下，把 `themes/nexus/layouts/` 的内容整体搬过去即可——
Hugo 的查找顺序是项目优先，行为不变。

---

## 内容与 front matter 契约

全站只用一套 front matter 字段，保持一致：

```toml
+++
title = '文章标题'
linkTitle = '列表页与上下篇里的短标题'   # 可选，不写就用 title
description = '一句话导语，同时用于 meta description 与卡片摘要'
date = 2026-09-20
tags = ['Rust', '存储引擎']
categories = ['系统']
+++
```

- 正文从 `##` 开始。页面模板已经输出了 `<h1>`，正文里再写 `#` 会出现两个一级标题。
- `description` 会同时进入 `<meta name="description">`、`og:description` 和 JSON-LD，
  所以按散文写，不要堆关键词。
- 代码块一律带语言标记（```` ```rust ````），否则 Chroma 无法高亮。
- `weight` 只对 `projects/` 有意义（数字小的排前面）。文章按日期倒序，不用 `weight`。
- 内部链接用根相对路径：`[标题](/posts/某个slug/)`。改 slug 之后要全仓库搜一遍旧路径。

新建页面：

```powershell
hugo new content posts/my-new-post.md      # 用 archetypes/default.md
hugo new content projects/my-project.md    # 用 archetypes/projects.md
```

`draft = true` 的页面默认不构建，预览时加 `-D`。

### 项目页的额外字段

```toml
[params]
  status = 'active'            # active | wip | archived（对应三套徽标配色）
  stack = ['Rust', 'gRPC']     # 技术栈 chips
  repo = 'https://github.com/you/repo'
  demo = 'https://demo.example.com'
```

---

## 短代码

主题现在只提供**一个**短代码：`callout`。它用**标准标记**（尖括号形式）调用——
该形式在 Markdown 渲染之后执行，`.Inner` 拿到的是未渲染文本，
所以模板里显式走了 `markdownify`，输出形态可预测。

`type` 可选 `info`（默认）、`tip`、`warn`、`danger`：

```text
{{< callout type="warn" title="标题可选" >}}
这里写 **Markdown**，会被正常渲染。
{{< /callout >}}
```

> 曾经还有一个 `terminal` 短代码（把 `$` 开头的行渲染成提示符 + 命令），
> 它只在骨架阶段的示例文章里用过。那批文章删除后没有任何页面引用它，
> `--printUnusedTemplates` 会把「模板未被使用」报成警告、并被 `--panicOnWarning` 升级为失败，
> 所以模板文件已删除。需要时按 git 历史 `9c494da` 之前的版本恢复即可。
>
> 换成像素风时，首页那块「终端卡片」也一起下线了（hero 的视觉卖点变成了 CSS 像素风景），
> 所以 `assets/js/main.js` 里给它写的逐行打字动画、以及 `hugo.toml` 的 `[params.hero]` 段落
> 都一并删除，避免留下永不触发的死代码。现在只有 **404 页**还在用终端样式
> （`.terminal-body` / `.tl-*`），那部分是静态文本，不需要 JS。
>
> 写文档时注意：如果要在**正文里展示**短代码写法本身，必须转义成
> `{{</* callout */>}}` 这样的形式。Hugo 在 Markdown 之前就扫描短代码，
> 代码围栏不提供保护——一个未转义的 `{{<` 会让整个构建失败。
> 另外正文里绝不能出现 `HAHAHUGOSHORTCODE` 这个字面量（它是 Hugo 的内部占位前缀）。

---

## 需要改的配置

全部集中在 `hugo.toml` 顶部的 `[params]`：

| 键 | 作用 |
| --- | --- |
| `baseURL` | 已设为线上地址 `https://koibunny.github.io/tech-blog/`。**改 GitHub 用户名或仓库名后必须同步**：Pages 不会把旧地址重定向过来（旧地址直接 404），而 canonical / og:url / og:image / sitemap 全由它生成 |
| `title` / `[params] tagline` | 站点名与副标题 |
| `[params] description` | 首页与默认 meta description |
| `[params] author` / `authorRole` / `location` / `email` | 页脚、JSON-LD、关于页署名 |
| `[params] startYear` | 页脚版权起始年份 |
| `[params.social]` | 有序数组，顺序即显示顺序。`icon` 字段会被压成一个像素方块显示首字母；**以 `/` 开头的站内地址**（如 RSS 的 `/index.xml`）由 `_partials/social-url.html` 换成带 baseURL 前缀的地址，所以可以放心写。**只放真实存在的账号**：模板会原样输出链接，占位地址等于给读者一个 404 |
| `[params] heroNote` | 首页 hero 那条「不追热点…」说明条的文字；不写就用模板里的缺省句 |
| `[params] ogImage` | 社交分享图路径，相对 `static/`，用 `absURL` 转绝对地址 |

配色令牌在 `themes/nexus/assets/css/base.css` 的 `:root` 里，改 `--cream` / `--brown-700` /
`--yellow` 就能整体换色，其余组件都引用这些变量；六档标签色是 `--hue-0`…`--hue-5`。
`--sh-1` / `--sh-2` / `--sh-card` 是那几组固定像素硬投影，改它们会同时影响所有"浮起来"的方块。

---

## SEO

模板层已经处理，不需要在内容里做额外工作：

- `<title>` 每页唯一；首页用站点名，其余用 `页面标题 · 站点名`
- `<link rel="canonical">` 用 `.Permalink`，始终是绝对地址
- `hugo.Environment` 不是 `production` 时输出 `noindex, nofollow`
- Open Graph + Twitter card；`og:image` 指向 `static/images/og-default.png`
- JSON-LD：首页 `WebSite`、文章 `BlogPosting`（含 `datePublished` / `dateModified` / `keywords`）
- `robots.txt` 只在 production 允许抓取，并始终输出 `Sitemap:` 行
- RSS 输出在 home / section / taxonomy / term 四类页面上

结构化数据的一个坑已经避开：`<script type="application/ld+json">` 里**不能**写
`{{ $data | jsonify }}`——`<script>` 是 JavaScript 上下文，Hugo 会把已序列化的字符串
再当成 JS 字符串字面量编码一次，结果是一个字符串而不是对象，所有消费者都会拒绝。
正确做法是把 `dict` 对象直接交给模板（见 `_partials/schema.html`）。

---

## 部署到 GitHub Pages

- 仓库：<https://github.com/koibunny/tech-blog>
- 线上地址：**<https://koibunny.github.io/tech-blog/>**

推送到 `main` 分支即自动构建并发布，工作流是 `.github/workflows/hugo.yml`：

1. `actions/configure-pages` 给出 `base_url`，工作流用它覆盖 `--baseURL`，
   因此同一份配置既适用于用户站点（`user.github.io`）也适用于项目站点（`user.github.io/repo/`）
2. `upload-pages-artifact` 上传 `public/`，`deploy-pages` 完成发布
3. 仓库的 Pages **Source 已设为 GitHub Actions**（如需手动核对：Settings → Pages → Source）

注意 `actions/checkout` 必须带 `fetch-depth: 0`：`enableGitInfo = true` 依赖完整历史，
浅克隆会让每页的 `lastmod` 失去意义。

工作流里的 `HUGO_VERSION` 是钉住的（当前 `0.167.0`），升级本地版本时记得同步——
README 末尾记录了验证过的版本。

其他托管平台（Netlify / Vercel / Cloudflare Pages）只需要：

- 构建命令：`hugo --gc --minify`
- 发布目录：`public`
- 环境变量：`HUGO_VERSION=0.167.0`、`HUGO_ENVIRONMENT=production`

---

## 工具链与验证记录

本地验证使用的二进制：`.tooling/hugo/hugo.exe`

```
hugo v0.167.0-3fff6fb5c267dacb26280c78dbe8c344054249c8+extended windows/amd64
```

主题的 `hugo.toml` 声明 `extended = false` / `min = '0.158.0'`：模板只用核心功能
（`resources.Get` / `resources.Concat` / `minify` / `fingerprint`），没有用 `css.Build` 或 SCSS，
所以标准版 Hugo 也能构建。`min` 的依据是 0.158.0 起 `languageCode` 改名 `locale` 且 `.Locale` 可用。

本仓库通过的确切检查（2026-10-03 换像素风之后重跑）：

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 严格构建 | `hugo --ignoreCache --cleanDestinationDir --panicOnWarning --printPathWarnings --printUnusedTemplates --printI18nWarnings` | 退出码 0，0 警告、0 路径冲突、0 未使用模板；28 页、4 个静态文件 |
| 内容清单 | `hugo list all` | 11 行（1 行表头 + 10 个内容页），与 `content/` 里 10 个 `.md` 一一对应 |
| 产物齐全 | 逐个核对 `public/` | 18 个 HTML 齐全：7 个内容页 + 列表/标签/分类/分页/404 |
| 生产环境 | `hugo`（默认 `production`） | `robots.txt` 为 `Allow: /`，页面 `index, follow` |
| 开发环境 | `hugo -e development` | `robots.txt` 为 `Disallow: /`，页面 `noindex, nofollow` |
| 内部链接 | 遍历 `public/` 收集 `href`/`src`，按目录解析（目录补 `index.html`、中文路径先 `decodeURIComponent`）后逐个验证目标存在 | 375 个站内链接引用，0 断链 |
| baseURL 前缀 | 遍历 `public/` 检查每个站内绝对地址都以 `/tech-blog/` 开头 | 0 例外（这条曾经挂过，见下面「两个真实断链」） |
| class 覆盖 | 把 HTML 里用到的 class 与 `bundle.css` 的选择器做交叉核对 | 0 缺口（仅剩 Chroma 代码高亮的 `n`/`nv`/`p` 等 1-2 字母 token 类，那是有意为之） |
| 编码完整性 | 按字节读回所有改动文件，用 `UTF-8` 解码后搜 GBK 误解码特征 | 0 命中（见下面「PowerShell 批量改写会把中文写坏」） |
| 视觉验证 | 无头 Chrome + CDP（`Emulation.setDeviceMetricsOverride` 设视口），5 个页面 × 桌面 1440 / 移动 390 | 全部 `horizontalOverflow: false`，无元素越界；截图逐张核对 |
| 结构化数据 | 用真实 JSON 解析器解析 JSON-LD | 解析通过：首页 `@type=WebSite`，文章与项目页 `@type=BlogPosting` |
| 短代码转义 | 在 `content/` 里搜可疑分隔符写法与占位字面量 | 无可疑写法，无 `HAHAHUGOSHORTCODE` |
| 身份占位符 | 在 `public/` 全文搜 `Your Name` / `yourname` / `you@example` | 0 命中 |

### 换风格时实际抓到的两个真实断链（值得记下来）

这两个都是**主题之外**的既有问题，本地 `hugo server` 完全看不出来，只在项目站点上 404：

1. **Hugo 的 `relURL` 不会拼 baseURL 的路径部分。** 模板里写 `{{ "/posts/" | relURL }}`
   得到的是 `/posts/`，不是 `/tech-blog/posts/`。本地 server 的 baseURL 没有路径，
   所以看起来一切正常；线上 `https://koibunny.github.io/tech-blog/` 就会跳到域名根。
   修法是统一走 `_partials/site-url.html`：`pageRef` 取内容页的 `.RelPermalink`，
   `output` 取 `OutputFormats`（RSS 用），`file` 才用 `relURL`。
   另外 `hugo.toml` 里 `[[params.social]]` 的 RSS 地址是 `/index.xml`，
   它由 `_partials/social-url.html` 解析，不能直接输出 `.url`。
2. **正文里的根相对 Markdown 链接**（`[《E 盘开源体检》](/posts/open-source-audit/)`）同样是裸地址，
   要换成 `[《E 盘开源体检》]({{</* relref "/posts/open-source-audit" */>}})`。

判据：**只要一个站内地址不是 Hugo 算出来的，就要怀疑它在项目站点上会不会失效。**
上面的「baseURL 前缀」那一项就是专门盯这个的。

### 两个过程性教训

- **PowerShell 批量改写文本文件会写坏中文。** 用 `Get-Content`（默认按 ANSI 读）
  读含中文的模板再 `WriteAllText` 写回，中文会变成 `鈻?闃呰` 这种 GBK 误解码产物。
  要么用会按 UTF-8 读写的编辑器，要么显式 `[System.IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)`。
  改完必须按字节读回来验证，光看构建成功是不够的——Hugo 会把乱码当普通字符照常渲染。
- **视觉验证不能省。** 这次抓到三个只有渲染出来才看得见的问题：
  404 页一条遗留的 `.error-terminal{background:var(--navy)}` 配上硬编码的浅色文字，
  让 `curl` 那行变成白底白字；hero 风景被遮罩压到几乎看不见；
  卡片封面顶部有一条 2px 白缝（图层高度取了非整数）。
  这些在构建日志里一个警告都不会有。

删除内容之后，有两件事必须一起做，这次两个都实际踩到了：

1. **加 `--cleanDestinationDir` 重新构建**。普通构建**不会**移除 `public/` 下已生成的旧目录，
   被删的页面会继续在线；
2. **看警告数是否为零**。删掉 6 篇示例文章后，主题里的 `terminal` 短代码失去全部引用，
   `--printUnusedTemplates` 报出「模板未被使用」，`--panicOnWarning` 把它升级成构建失败（退出码 2）。
   判据是：**删内容之后警告数必须为零，否则说明有东西只被被删页面引用着。**

断链检查有两处容易做错，记录一下判据：

- 站内链接在产物里带 `baseURL` 路径前缀（`/tech-blog/...`），比较前必须去掉，否则全部误报；
- 中文标签/分类目录在 `href` 里是百分号编码的，比较前必须 `[uri]::UnescapeDataString` 解码。

`assets/css/syntax.css` 是生成的，不要手改。**风格必须是浅色系**——全站底色是奶油纸，
深色主题的代码块会像补丁。换 `[markup.highlight] style` 之后按下面的方式重新生成：

> Windows PowerShell 5.1 的 `>` 会把输出写成 **UTF-16LE**（带 `FF FE` 序言），不是 UTF-8。
> 这个文件会被拼接到 `bundle.css` 中间，非 UTF-8 字节会造成解析错误。
> 实测（Hugo 0.167.0）`gen chromastyles` 的 `-d` 参数**只改输出里的注释**，
> 无论给它目录还是 `.css` 文件名都仍然打到 stdout、不落盘，所以别指望用它落文件。
> 可靠写法是让 PowerShell 自己显式写 UTF-8（`.NET` 调用，无 BOM）：
>
> ```powershell
> $css = hugo gen chromastyles --style tokyonight-day
> [System.IO.File]::WriteAllText(
>   "themes\nexus\assets\css\syntax.css",
>   ($css -join "`n") + "`n",
>   (New-Object System.Text.UTF8Encoding($false))
> )
> ```
>
> 生成后核对前三个字节不是 `FF FE`（UTF-16LE）也不是 `EF BB BF`（UTF-8 BOM）。

社交分享图 `static/images/og-default.png` 与两个 favicon 也是生成的（像素风），
生成脚本在本工作区，用工作区自带的 Python 跑：

```powershell
& "E:\DeepSeekHarnessWork\.tooling\make-og-pixel.py"
```

脚本里的 `TITLE` / `TAGLINE` 是硬编码的，改站名或副标题时要同步。

---

## 已知取舍

- **只做浅色**。奶油纸底是整套视觉的前提，没有明暗切换开关，`color-scheme` 固定为 `light`。
  代码块的高亮风格也必须跟着选浅色系（见上面 `syntax.css` 那一段）。
- **没有站内搜索**。静态站点要做搜索需要额外的索引文件或第三方服务，当前刻意留空。
- **正文里没有图片资源**。视觉全部由 CSS 渐变与几何图形构成；
  唯一的位图是两个**站外用途**的产物：`og-default.png`（社交分享卡片）
  和 `favicon.ico` / `favicon-256.png`（浏览器标签图标），都由 `make-og-pixel.py` 生成。
- **hero 的像素风景是 CSS 画的，不是位图**。好处是零素材、任意分辨率都锐利；
  代价是形状只能做到"阶梯色块"级别，画不出参考页那种手绘像素画的细节
  （比如参考页那只坐在电脑前的兔子）。`.hero-scene` 里的每个元素都是一个
  定好 `background-size` 的 div，想改形状就改那些尺寸和位置。
- **文章数量少**。`posts/` 目前只剩 1 篇（[E 盘开源体检](content/posts/open-source-audit.md)）。
  骨架阶段那 6 篇示例长文因实测数字与故障时间线是构造的而整体删除；
  Nova 那篇因题材不属于本站作者而删除。文章需要从头积累——
  这是「只留自己能负责的内容」的必然代价，属于有意选择而非缺陷。
- **构建环境已修复，但不是零成本**。`%LOCALAPPDATA%\Temp\hugo_cache` 目前已预建，
  `hugo` 可直接运行；如果该目录被清理工具删掉，需要按「构建环境备注」重建一次。
- **`categories` 分类法已启用但页脚没有入口**。术语页本身会生成并进入 sitemap；
  如果不想要，在 `hugo.toml` 里设 `disableKinds = ['taxonomy', 'term']` 会同时删掉 `tags` 页。
- **`.Date` 一律用 `not .IsZero` 守卫**。`time.Time` 是结构体，`with .Date` 永远为真，
  没有日期的页面会印出 `0001-01-01`。
