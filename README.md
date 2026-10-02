# NEXUS — 科技风个人博客

一个 Hugo 静态站点：深色霓虹配色、纯 CSS 绘制的网格与光晕、零第三方 JS 依赖。
内容为中文，覆盖文章、项目与关于三类页面。

- **Hugo**：v0.167.0（本仓库在 v0.167.0 上验证通过，见文末「验证记录」）
- **主题**：`themes/nexus`，自研，随仓库一起版本管理
- **依赖**：无。没有 npm、没有 Hugo Modules、没有外部字体

---

## 快速开始

本工作区已经放了一份便携版 Hugo，不需要另外安装：

```powershell
# 本地预览（带热重载）
E:\DeepSeekHarnessWork\.tooling\hugo\hugo.exe server -D

# 生成静态站点到 public/
E:\DeepSeekHarnessWork\.tooling\hugo\hugo.exe --gc --minify
```

如果 `hugo` 已经在你自己的 PATH 上，把上面的完整路径换成 `hugo` 即可。

预览地址默认是 <http://localhost:1313/>。

> `hugo server` 的运行环境是 `development`，页面会带 `noindex, nofollow`，
> `robots.txt` 也会整站 `Disallow`。直接运行 `hugo`（不指定 `-e`）时环境是 `production`，
> 两者都会切换成允许抓取。

---

## 目录结构

```
tech-blog/
├── hugo.toml                  # 站点配置：身份、菜单、日期来源、Markdown、高亮
├── archetypes/                # hugo new content 的 front matter 模板
│   ├── default.md
│   └── projects.md
├── content/
│   ├── _index.md              # 首页（正文会渲染在 hero 下方）
│   ├── about.md               # /about/
│   ├── posts/                 # /posts/ —— 文章
│   └── projects/              # /projects/ —— 项目
├── layouts/
│   └── baseof.html            # ★ 契约层：骨架与块名，见下一节
├── static/
│   ├── favicon.svg
│   └── images/og-default.png  # 社交分享图（og:image）
├── themes/nexus/
│   ├── hugo.toml              # 只声明 hugoVersion 约束
│   ├── layouts/               # 页面模板与 partials
│   │   ├── home.html  page.html  section.html  taxonomy.html  term.html
│   │   ├── 404.html  robots.txt
│   │   ├── _partials/         # head / header / footer / menu / 卡片 / 目录 …
│   │   └── _shortcodes/       # callout、terminal
│   └── assets/
│       ├── css/               # base + components/*，外加生成的 syntax.css
│       └── js/main.js         # 导航、复制按钮、进度条、目录高亮
└── .github/workflows/hugo.yml # GitHub Pages 部署
```

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

两个短代码都用**标准标记**（尖括号形式）调用。该形式在 Markdown 渲染之后执行，
`.Inner` 拿到的是未渲染文本，所以模板里显式走了 `markdownify`，输出形态可预测。

提示框，`type` 可选 `info`（默认）、`tip`、`warn`、`danger`：

```text
{{< callout type="warn" title="标题可选" >}}
这里写 **Markdown**，会被正常渲染。
{{< /callout >}}
```

终端块，首字符为 `$` 的行渲染成「提示符 + 命令」，其余行渲染成输出：

```text
{{< terminal title="cargo test" >}}
$ cargo test --test recovery
running 12 tests
test result: ok. 12 passed; 0 failed
{{< /terminal >}}
```

> 写文档时注意：如果要在**正文里展示**短代码写法本身，必须转义成
> `{{</* callout */>}}` 这样的形式。Hugo 在 Markdown 之前就扫描短代码，
> 代码围栏不提供保护——一个未转义的 `{{<` 会让整个构建失败。
> 另外正文里绝不能出现 `HAHAHUGOSHORTCODE` 这个字面量（它是 Hugo 的内部占位前缀）。

---

## 需要改的配置

全部集中在 `hugo.toml` 顶部的 `[params]`：

| 键 | 作用 |
| --- | --- |
| `baseURL` | 已设为线上地址 `https://0127yy-cloud.github.io/tech-blog/`。换域名或改仓库名后必须同步，否则 canonical / og:url / sitemap 全指错 |
| `title` / `[params] tagline` | 站点名与副标题 |
| `[params] description` | 首页与默认 meta description |
| `[params] author` / `authorRole` / `location` / `email` | 页脚、JSON-LD、关于页署名 |
| `[params] startYear` | 页脚版权起始年份 |
| `[params.social]` | 有序数组，顺序即显示顺序；`icon` 字段当前未使用（用文字链接） |
| `[params.hero.lines`] | 首页终端卡片逐行打印的文字，偶数下标渲染成命令、奇数下标渲染成输出 |
| `[params] ogImage` | 社交分享图路径，相对 `static/`，用 `absURL` 转绝对地址 |

配色令牌在 `themes/nexus/assets/css/base.css` 的 `:root` 里，改 `--cyan` / `--magenta` / `--bg`
就能整体换色，其余组件都引用这些变量。

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

- 仓库：<https://github.com/0127yy-cloud/tech-blog>
- 线上地址：**<https://0127yy-cloud.github.io/tech-blog/>**

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

本仓库通过的确切检查：

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 严格构建 | `hugo --ignoreCache --panicOnWarning --printPathWarnings --printUnusedTemplates --printI18nWarnings --templateMetrics` | 退出码 0，0 警告、0 路径冲突、0 未使用模板 |
| 内容清单 | `hugo list all` | 13 行，与 `content/` 里 13 个页面一一对应 |
| 产物齐全 | 逐个核对 `public/` | 13/13 内容页都有对应 `index.html` |
| 生产环境 | `hugo`（默认 `production`） | `robots.txt` 为 `Allow: /`，页面 `index, follow` |
| 开发环境 | `hugo -e development` | `robots.txt` 为 `Disallow: /`，页面 `noindex, nofollow` |
| 内部链接 | 自写检查脚本遍历 `public/` | 35 个 HTML、38 个站内 URL，0 断链 |
| 结构化数据 | 用真实 JSON 解析器解析 JSON-LD | 解析通过，`@type=BlogPosting` |
| 短代码转义 | 在 `content/` 里搜未转义分隔符与占位字面量 | 无未转义写法，无 `HAHAHUGOSHORTCODE` |

`assets/css/syntax.css` 是生成的，不要手改。换了 `[markup.highlight] style` 之后重新生成：

```powershell
hugo gen chromastyles --style tokyonight-night > themes/nexus/assets/css/syntax.css
```

> Windows PowerShell 5.1 的 `>` / `-Encoding UTF8` 会写 BOM。这个文件会被拼接到
> `bundle.css` 中间，开头的 BOM 会造成解析错误。生成后用编辑器另存为「UTF-8 无 BOM」，
> 或者核对文件前三个字节不是 `EF BB BF`。

---

## 已知取舍

- **只做深色**。没有明暗切换开关，`color-scheme` 固定为 `dark`。
- **没有站内搜索**。静态站点要做搜索需要额外的索引文件或第三方服务，当前刻意留空。
- **没有图片资源**。视觉全部由 CSS 渐变与几何图形构成，所以仓库里没有二进制素材。
- **`categories` 分类法已启用但页脚没有入口**。术语页本身会生成并进入 sitemap；
  如果不想要，在 `hugo.toml` 里设 `disableKinds = ['taxonomy', 'term']` 会同时删掉 `tags` 页。
- **`.Date` 一律用 `not .IsZero` 守卫**。`time.Time` 是结构体，`with .Date` 永远为真，
  没有日期的页面会印出 `0001-01-01`。
