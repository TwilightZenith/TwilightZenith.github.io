/**
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
