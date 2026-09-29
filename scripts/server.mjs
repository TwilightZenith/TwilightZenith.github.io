/**
 * server.mjs — 本地模拟 Cloudflare Worker（静态资产模式）的 HTTP 服务器
 * 用法：npm run dev（或 node scripts/server.mjs）
 * 启动后访问 http://127.0.0.1:8787
 *
 * 模拟内容：
 *  - dist/ 目录 = Cloudflare 静态资产（env.ASSETS）
 *  - worker.js 的 fetch 逻辑（/xxx → /xxx.html 友好路由）
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize, sep } from 'node:path';
import worker from '../worker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = 8787;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
};

// 模拟 Cloudflare ASSETS binding：按路径返回 dist/ 下的文件
// （目录路径返回该目录下的 index.html，与 Cloudflare 静态资产行为一致）
const ASSETS = {
  async fetch(request) {
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);
    if (path === '/' || path === '') path = '/index.html';

    // 防目录穿越：规范化后必须仍在 DIST 内
    const file = normalize(join(DIST, path));
    if (!file.startsWith(DIST + sep)) {
      return new Response('Forbidden', { status: 403 });
    }

    // 目录路径 → 目录下的 index.html
    let target = file;
    try {
      if ((await stat(target)).isDirectory()) target = join(file, 'index.html');
    } catch {
      // 路径不存在，继续走 readFile 得到 404
    }

    try {
      const data = await readFile(target);
      return new Response(data, {
        headers: {
          'Content-Type': MIME[extname(target)] || 'application/octet-stream',
          // 本地 dev 不缓存，避免浏览器拿到旧页面；部署到 Cloudflare 后由 CDN 处理缓存
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const request = new Request(url, { method: req.method, headers: req.headers });
  const response = await worker.fetch(request, { ASSETS });
  res.writeHead(response.status, {
    'Content-Type': response.headers.get('Content-Type') || 'text/plain',
    'Cache-Control': response.headers.get('Cache-Control') || 'no-cache',
  });
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(PORT, HOST, () => {
  console.log(`✔ 本地模拟 Worker（静态资产模式）已启动：http://${HOST}:${PORT}`);
  console.log('  按 Ctrl+C 停止');
});
