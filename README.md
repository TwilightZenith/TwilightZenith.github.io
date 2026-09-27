# daff_page

图书馆机器人 VLA 算法技术落地可行性报告的静态站点仓库。源文档为 Markdown，通过构建脚本生成静态页面，可部署到 [GitHub Pages](https://twilightzenith.github.io/) 或 [Cloudflare Workers](https://wispy-butterfly-e184.adafftang0617.workers.dev/)。

## 目录结构

```
daff_page/
├── docs/
│   ├── vla-tech.md        # 源文档 1：VLA 报告（默认首页 /）
│   └── beauty_vim.md      # 源文档 2：Vim/终端配置笔记（路由 /beauty_vim）
├── scripts/
│   ├── build.mjs          # 构建脚本：扫描 docs/*.md → dist/ 静态站点 + 轻量 worker.js
│   └── server.mjs         # 本地开发服务器：模拟 Cloudflare Worker（静态资产模式）
├── dist/                  # 构建产物：独立 HTML 静态文件（部署资产，勿手改）
│   ├── index.html         # 首页
│   ├── vla-tech.html
│   └── beauty_vim.html
├── index.html             # GitHub Pages 首页（勿手改）
├── beauty_vim.html        # GitHub Pages 第二页，带 .html 的地址（勿手改）
├── beauty_vim/index.html  # GitHub Pages 第二页，/beauty_vim 路由（勿手改）
├── worker.js              # 构建产物（轻量路由兜底：/xxx → /xxx.html，勿手改）
├── wrangler.jsonc         # Cloudflare Workers 配置（main + assets 指向 dist/）
├── package.json           # npm 配置（build/dev 脚本 + marked 依赖）
├── package-lock.json      # 依赖锁文件
└── .gitignore             # 忽略 node_modules / .wrangler 等
```

> `dist/`、根目录生成的 HTML 与 `worker.js` 均由构建脚本自动生成，修改源文档后需重新构建；不要直接编辑它们。生成文件必须提交到 Git（Cloudflare 构建仅执行 deploy 命令，不执行 build；GitHub Pages 从仓库根目录发布）。

## 前置要求

- Node.js ≥ 18（构建脚本使用 ESM + `import.meta.url`）
- npm（随 Node.js 安装）

## 构建步骤

```bash
# 1. 安装依赖（首次或依赖变更后执行）
npm install

# 2. 构建页面
npm run build
```

构建产物输出到 `dist/`（Cloudflare 静态文件）、`worker.js`（Cloudflare 路由兜底）和仓库根目录（GitHub Pages 静态文件）。

## 本地预览

```bash
# 方式一：本地模拟 Worker 服务器（推荐，与真实部署链路一致）
npm run dev          # 启动后访问 http://127.0.0.1:8787/
#   server.mjs 直接调用 worker.js 的 fetch 逻辑，返回内容和线上完全一致

# 方式二：直接用浏览器打开构建产物（file:// 协议，无需启动服务）
start index.html
```

### `npm run dev` 与 `npx wrangler dev` 的区别

| | `npm run dev`（本仓库提供） | `npx wrangler dev`（官方工具） |
| --- | --- | --- |
| 本质 | 极简 HTTP 服务器，直接调用 `worker.js` 的 `fetch` | wrangler 官方本地开发服务器，运行完整 Cloudflare Worker 运行时 |
| 模拟程度 | 仅 fetch 返回 HTML 的逻辑 | 完整运行时（KV / D1 / R2 绑定、定时任务等） |
| Node 版本要求 | ≥ 18（当前项目 v20 即可） | ≥ 22（wrangler 4.x 要求） |
| 是否需要登录 | 否 | 否（dev 模式） |
| 访问地址 | http://127.0.0.1:8787/ | http://localhost:8787/ |
| 适用场景 | 本项目（单页面，无绑定）够用 | 需要调试完整 Worker 环境时 |

本项目的 Worker 只做 `dist/` 静态资产的路由兜底（`/xxx → /xxx.html`），`npm run dev` 已足够且无 Node 版本门槛；`npx wrangler dev` 是官方全能方案，但需要 Node ≥ 22。

## 多页面与站内链接

`npm run build` 会扫描 `docs/*.md`，**每个文件生成一个独立页面**：

| 源文件 | 路由 | 说明 |
| --- | --- | --- |
| `docs/vla-tech.md` | `/`（及 `/vla-tech`、`/vla-tech.html`） | 默认首页 |
| `docs/beauty_vim.md` | `/beauty_vim`（及 `/beauty_vim.html`） | 自动生成的第二页；GitHub Pages 将前者转到 `/beauty_vim/` |

**页面间跳转方式：**

1. **自动导航条**：每个页面顶部自动生成站点导航（列出全部页面），点击即跳转；
2. **md 内写链接**：在 Markdown 里用相对路径引用其他文档，构建时自动重写：

```markdown
[Vim 配置笔记](beauty_vim.md)
```

构建后链接会自动变成 `beauty_vim.html`；GitHub Pages 与 Cloudflare 均可访问。

> ⚠️ 不要用 `file:///...` 绝对本地路径写链接（如 `[xxx](file:///D:/.../xxx.md)`），部署到 Cloudflare 后无效。

新增页面只需往 `docs/` 放一个 `.md` 文件，重新构建即自动出现在导航条与路由表中。

## 更新文档

1. 编辑 `docs/vla-tech.md`
2. 本地预览：`npm run dev` 后刷新浏览器（或先 `npm run build` 再直接打开 index.html）
3. 提交并推送：

```bash
git add docs/ dist/ index.html beauty_vim.html beauty_vim/index.html worker.js
git commit -m "docs: 更新报告内容"
git push
```

> 推送后 Cloudflare 的 Git 集成会自动重新构建部署（执行 `npx wrangler deploy`，读取 `wrangler.jsonc`）。

GitHub Pages 若设置为从默认分支的仓库根目录发布，推送后也会更新 `https://twilightzenith.github.io/beauty_vim`。GitHub Pages 不执行 `worker.js`，所以页面必须存在于根目录的对应路径。

## 部署到 Cloudflare

### 部署架构（Workers Static Assets）

页面以**独立静态文件**形式部署，不再内嵌进 Worker：

```
请求 → Cloudflare 边缘
        ├─ /beauty_vim.html 等静态文件 → 直接返回 dist/ 下的文件（CDN 缓存）
        └─ /beauty_vim 等无扩展名路径 → worker.js 轻量兜底，补 .html 后交给静态资产
```

- `wrangler.jsonc`：`assets.directory = "./dist"`，`binding = "ASSETS"`（worker 通过 `env.ASSETS.fetch()` 访问）
- `worker.js` 仅 0.8 KB：只做 `/xxx → /xxx.html` 的友好路由，**页面本体全部在 dist/，不随脚本体积增长**
- 新增文档只增加 `dist/` 里的文件，Worker 脚本大小恒定

### Cloudflare Workers（推荐，与当前 worker.js 部署方式一致）

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → 你的 Worker
2. 进入「编辑代码」，把仓库根目录 `worker.js` 的**全部内容**粘贴替换
3. 在「设置」→「绑定」中确认存在 **Assets / ASSETS 绑定**，目录指向构建产出的 `dist/`
4. 点击「部署」（Deploy）
5. 访问你的 Worker 域名即可看到页面

以后更新内容：编辑 `docs/*.md` → `npm run build` → 提交并推送（`dist/` 与 `worker.js` 会一并更新）→ 部署。

### Cloudflare Pages（Git 集成）

| 配置项 | 值 |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `/`（根目录） |

### 部署原理（FAQ）

**Q1：Cloudflare 部署时用的是哪个命令？**

用的是 `npx wrangler deploy`，**不是** `wrangler dev`：

| 命令 | 性质 | 作用 |
| --- | --- | --- |
| `npx wrangler dev` | 本地开发 | 本地起服务器模拟 Worker，**不发布** |
| `npx wrangler deploy` | 正式部署 | 打包上传到 Cloudflare 边缘节点，**发布生效** |

云端的 deploy 命令来自 Cloudflare 控制台的部署配置（本项目为 `npx wrangler deploy`），Git 集成在每次 push 后自动执行。

**Q2：`wrangler.jsonc` 起什么作用？**

它是部署的"地图"，告诉 wrangler 一切关键信息：

```jsonc
{
  "name": "wispy-butterfly-e184",   // 部署到哪个 Worker
  "main": "worker.js",              // 代码入口
  "assets": {
    "directory": "./dist",          // 静态资产目录
    "binding": "ASSETS"             // worker 内通过 env.ASSETS 访问
  }
}
```

**Cloudflare 不会自动扫描仓库找 worker.js**，而是完全按这份配置执行。云端部署链路：

```
GitHub push
  → Cloudflare 构建环境：npm clean-install → npx wrangler deploy
  → wrangler 读取 wrangler.jsonc
  → 打包 worker.js（0.8 KB 入口） + 收集 dist/ 静态文件
  → 上传到 Cloudflare 边缘 → 生效
```

**Q3：没有 `wrangler.jsonc` 时会怎样？（本仓库的踩坑经历）**

wrangler 会启动**交互式初始化向导**自动"猜测"项目设置。在 Cloudflare 这类非交互式环境中，它会静默采用默认值：

```
Detected Project Settings:
 - Framework: Static            ← 自动检测为静态站点
 - Output Directory: .          ← 自动把输出目录猜成仓库根目录
? Do you want to modify these settings?
🤖 Using fallback value in non-interactive context: no
```

于是自动生成 `assets.directory = "."` —— 把**整个仓库根目录（含 node_modules）**当静态资产上传，148 MiB 的 `workerd` 二进制撞上 25 MiB 单文件上限，部署失败。

**结论**：没有 `wrangler.jsonc` 时部署依赖 wrangler 的"启发式猜测"，猜错就翻车；配置文件在手，部署行为才完全可控。

## 技术说明

- Markdown 渲染：`marked`（GFM 表格）
- Mermaid 架构图：浏览器端由 mermaid.js 渲染
- 代码高亮：highlight.js
- 样式：github-markdown-css + 自定义左侧目录布局
- CDN：cdnjs（github-markdown-css / highlight.js / mermaid）
