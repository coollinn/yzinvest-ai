/**
 * Cloudflare Pages Advanced Mode Worker (_worker.js)
 * - /api/* → 代理到 API Worker
 * - 其他路径 → 返回静态资源（SPA fallback 到 index.html）
 */

const API_WORKER = "https://yzinvest-ai-api.coollinn.workers.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API 请求代理到 Worker
    if (url.pathname.startsWith("/api/")) {
      const targetUrl = API_WORKER + url.pathname + url.search;

      const headers = new Headers(request.headers);
      headers.delete("host");
      headers.delete("connection");
      headers.delete("keep-alive");
      headers.delete("transfer-encoding");

      const init = {
        method: request.method,
        headers: headers,
        redirect: "follow",
      };

      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = request.body;
        init.duplex = "half";
      }

      try {
        const response = await fetch(targetUrl, init);
        return response;
      } catch (err) {
        return new Response(
          JSON.stringify({ ok: false, error: { code: "PROXY_ERROR", message: String(err) } }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // 非 API 请求交给 Pages 静态资源处理
    // env.ASSETS 是 Cloudflare Pages 注入的静态资源服务
    const response = await env.ASSETS.fetch(request);

    // 404 → SPA fallback
    if (response.status === 404) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    }

    return response;
  },
};
