/**
 * build.mjs — 将 docs/*.md 批量转换为 dist/ 静态站点 + 轻量 worker.js
 * 用法：npm run build
 * 依赖：marked（npm install marked）
 *
 * 约定：
 *  - docs/*.md 每个文件生成 dist/{文件名}.html 与 dist/{文件名}/index.html（Cloudflare 静态资产）
 *  - 每个文档同时生成根目录 {文件名}.html 和 {文件名}/index.html（GitHub Pages 路由）
 *  - 仓库根目录 index.html 为手写项目主页，构建时复制到 dist/index.html（两个托管平台共用）
 *  - md 内站内链接写相对路径 xxx.md，构建时自动重写为 xxx.html
 *  - 根目录 assets/ 中的图片等文件复制到 dist/assets/，供两个托管平台使用
 *  - worker.js 仅做友好路由兜底：/xxx → /xxx.html（页面本体全部在 dist/，不再内嵌）
 */
import { readFileSync, writeFileSync, copyFileSync, readdirSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { marked } from 'marked';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = join(ROOT, 'docs');
const DIST_DIR = join(ROOT, 'dist');
const ASSETS_DIR = join(ROOT, 'assets');
const HOME_PAGE = join(ROOT, 'index.html'); // 手写项目主页（GitHub Pages 根目录首页）
const WORKER_PATH = join(ROOT, 'worker.js');

// ---- marked 全局配置（toc / extraHeadingSeq 为模块级，渲染前重置）----
let toc = [];
let extraHeadingSeq = 0;

marked.use({
  gfm: true,
  renderer: {
    // mermaid 代码块 → mermaid 可识别的元素
    code({ text, lang }) {
      if (lang === 'mermaid') {
        return `<pre class="mermaid">${text.trim()}</pre>`;
      }
      const cls = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${cls}>${text}</code></pre>`;
    },
    // 标题注入锚点 id，供 TOC 跳转
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const idx = toc.findIndex((t) => t.text === text.replace(/<[^>]+>/g, '').trim());
      const id = idx >= 0 ? toc[idx].id : `h-${++extraHeadingSeq}`;
      return `<h${depth} id="${id}">${text}</h${depth}>`;
    },
  },
});

// ---- 渲染单个 Markdown 页面 ----
function renderPage(md) {
  // 生成 TOC（h2/h3；h1 作为页面主标题）
  const lines = md.split('\n');
  toc = [];
  let tocSeq = 0;
  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.+)/);
    if (m) {
      const level = m[1].length;
      const text = m[2].replace(/\*\*|`/g, '').trim();
      toc.push({ level, text, id: `toc-${++tocSeq}` });
    }
  }

  extraHeadingSeq = 0;
  let bodyHtml = marked.parse(md);

  // 站内链接重写：href="xxx.md" → href="xxx.html"（不影响外链 http(s)）
  bodyHtml = bodyHtml.replace(/href="([^"]+)\.md"/g, 'href="$1.html"');

  // 组装 TOC HTML
  let tocHtml = '';
  for (const item of toc) {
    const pad = item.level === 3 ? ' style="padding-left:18px;font-size:12.5px;"' : '';
    tocHtml += `<a href="#${item.id}"${pad}>${item.text}</a>`;
  }

  return { bodyHtml, tocHtml, toc };
}

// ---- 页面模板 ----
function buildHtml({ title, navHtml, tocHtml, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown-light.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
<style>
  :root { --toc-w: 280px; --border: #d8dee4; }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: #fff; color: #1f2328;
         font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  /* 顶部站点导航 */
  .sitenav { display: flex; flex-wrap: wrap; gap: 4px 20px; align-items: center;
             padding: 10px 24px; background: #f6f8fa; border-bottom: 1px solid var(--border); }
  .sitenav .label { font-size: 12px; color: #57606a; margin-right: 4px; }
  .sitenav a { color: #0969da; text-decoration: none; font-size: 14px; }
  .sitenav a:hover { text-decoration: underline; }
  .layout { display: flex; min-height: 100vh; }
  /* 左侧目录 */
  .toc {
    width: var(--toc-w); flex: 0 0 var(--toc-w);
    border-right: 1px solid var(--border);
    padding: 28px 18px; position: sticky; top: 0; height: 100vh; overflow-y: auto;
    background: #fff; font-size: 14px;
  }
  .toc .brand { font-weight: 700; font-size: 15px; margin-bottom: 6px; color: #0969da; }
  .toc .brand-sub { font-size: 12px; color: #57606a; margin-bottom: 18px; }
  .toc a { display: block; padding: 5px 10px; margin: 1px 0; border-radius: 6px;
           color: #24292f; text-decoration: none; line-height: 1.45; }
  .toc a:hover { background: #eaeef2; color: #0969da; }
  /* 右侧正文 */
  .content { flex: 1; min-width: 0; padding: 40px 48px 80px; }
  .markdown-body { max-width: 960px; margin: 0 auto; }
  .markdown-body h1 { padding-bottom: .3em; border-bottom: 1px solid var(--border); }
  .markdown-body pre { border-radius: 8px; }
  .markdown-body pre.mermaid { background: #fff; text-align: center; border: 1px dashed var(--border); }
  .markdown-body table { display: table; width: 100%; }
  .markdown-body img { max-width: 100%; }
  /* 移动端 */
  @media (max-width: 860px) {
    .layout { flex-direction: column; }
    .toc { width: 100%; flex: none; height: auto; position: static; max-height: 40vh; }
    .content { padding: 24px 16px 60px; }
  }
</style>
</head>
<body>
<nav class="sitenav" aria-label="站点导航"><span class="label">页面：</span><a href="/">首页</a>${navHtml}</nav>
<div class="layout">
  <nav class="toc" aria-label="目录">
    <div class="brand">📚 本页目录</div>
    <div class="brand-sub">${title}</div>
    ${tocHtml}
  </nav>
  <main class="content">
    <article class="markdown-body">
${bodyHtml}
    </article>
  </main>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js"></script>
<script>
  hljs.highlightAll();
  mermaid.initialize({ startOnLoad: true, theme: 'default', securityLevel: 'loose' });
</script>
</body>
</html>
`;
}

// ---- 主流程：扫描并构建所有页面 ----
const mdFiles = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md')).sort();
if (mdFiles.length === 0) {
  console.error('✘ docs/ 下没有 Markdown 文件');
  process.exit(1);
}
if (!existsSync(HOME_PAGE)) {
  console.error(`✘ 未找到手写主页 ${HOME_PAGE}，构建中止`);
  process.exit(1);
}

const pages = [];
for (const file of mdFiles) {
  const route = basename(file, '.md');
  const md = readFileSync(join(DOCS_DIR, file), 'utf8');
  const firstH1 = md.match(/^#\s+(.+)/m);
  const title = firstH1 ? firstH1[1].trim() : route;
  pages.push({ route, title, md });
}

// 站点导航条：首页 + 各文档路由
const navHtml = pages.map((p) => `<a href="/${p.route}">${p.route}</a>`).join('');

// 逐页生成 HTML
for (const p of pages) {
  const { bodyHtml, tocHtml } = renderPage(p.md);
  p.html = buildHtml({ title: p.title, navHtml, tocHtml, bodyHtml });
}

// ---- 输出静态资产到 dist/ ----
// 每次构建清空 dist，防止旧页面残留
rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(DIST_DIR, { recursive: true });
if (existsSync(ASSETS_DIR)) {
  cpSync(ASSETS_DIR, join(DIST_DIR, 'assets'), { recursive: true });
}

// 手写主页复制到 dist/index.html
copyFileSync(HOME_PAGE, join(DIST_DIR, 'index.html'));
console.log('✔ dist/index.html（手写主页）已复制');

for (const p of pages) {
  writeFileSync(join(DIST_DIR, `${p.route}.html`), p.html, 'utf8');
  const distRouteDir = join(DIST_DIR, p.route);
  mkdirSync(distRouteDir, { recursive: true });
  writeFileSync(join(distRouteDir, 'index.html'), p.html, 'utf8');
}

// GitHub Pages 从仓库根目录发布：每个文档生成 {route}.html 与 {route}/index.html
for (const p of pages) {
  writeFileSync(join(ROOT, `${p.route}.html`), p.html, 'utf8');
  const routeDir = join(ROOT, p.route);
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, 'index.html'), p.html, 'utf8');
}

console.log(`✔ ${DIST_DIR}/ 已生成 ${pages.length} 个文档页面 + 手写主页`);
console.log('✔ 根目录已生成各文档的 .html 与目录路由（GitHub Pages）');

// ---- 生成 Cloudflare Worker（轻量路由兜底，页面本体在 dist/ 静态资产）----
const worker = `/**
 * Cloudflare Worker — daff_page 静态资产路由兜底
 * 本文件由 scripts/build.mjs 自动生成，请勿手改。
 *
 * 静态页面由 dist/ 目录提供（见 wrangler.jsonc 的 assets 配置），
 * 本 worker 仅负责友好路由：
 *   - /beauty_vim/   → 尝试 /beauty_vim/index.html（目录路径补 index.html）
 *   - /beauty_vim    → 尝试 /beauty_vim.html（无扩展名路径补 .html）
 *   - 其余请求      → 交给静态资产（存在返回文件，不存在返回 404）
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 根路径直接交给静态资产（index.html）
    if (path === '/') {
      return env.ASSETS.fetch(request);
    }

    // 无扩展名路径 → 目录补 /index.html，文件补 .html
    if (!path.includes('.')) {
      const suffix = path.endsWith('/') ? 'index.html' : '.html';
      const probe = new URL(url.origin + path + suffix, request.url);
      const res = await env.ASSETS.fetch(new Request(probe, request));
      if (res.status !== 404) return res;
    }

    // 其余（含 .html 后缀、静态资源、404）交给静态资产处理
    return env.ASSETS.fetch(request);
  },
};
`;

writeFileSync(WORKER_PATH, worker, 'utf8');
console.log(`✔ ${WORKER_PATH} 已生成（${(worker.length / 1024).toFixed(1)} KB，轻量路由兜底）`);
