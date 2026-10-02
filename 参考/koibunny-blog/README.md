# koibunny 博客首页

这是一个无需构建工具即可运行的静态 HTML/CSS/JS 首页原型。

## 使用方式

1. 解压文件。
2. 双击 `index.html` 即可在浏览器中打开。
3. 如果浏览器对本地资源有限制，也可以在该目录运行：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000`

## 文件

- `index.html`：页面结构
- `styles.css`：像素风、响应式布局
- `script.js`：移动端菜单与文章搜索
- `assets/koibunny-home-reference.png`：你提供的原始设计图，用作 Hero 场景背景

## 下一步适合继续做

- 把 emoji 图标替换为统一的锦鲤兔像素 PNG/SVG 素材
- 增加文章详情页
- 改成 Astro + Markdown 内容系统
- 部署到 Vercel / Netlify / GitHub Pages
