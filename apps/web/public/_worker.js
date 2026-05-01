/**
 * Cloudflare Pages Advanced Mode Worker (_worker.js)
 * - /api/* → 代理到 API Worker
 * - 其他路径 → 返回静态资源（SPA fallback 到 index.html）
 *   index.html 强制 no-cache，防止旧版本被浏览器/CDN 缓存
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
    let response = await env.ASSETS.fetch(request);

    // 404 → SPA fallback 到 index.html
    if (response.status === 404) {
      response = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    }

    // index.html 强制 no-cache（防止旧 bundle hash 对应的旧内容被缓存）
    const isHtml = response.headers.get("content-type")?.includes("text/html");
    if (isHtml) {
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
      newHeaders.set("Pragma", "no-cache");
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    }

    return response;
  },
};
