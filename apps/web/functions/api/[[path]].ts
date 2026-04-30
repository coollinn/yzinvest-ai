export interface ProxyEnv {
  API_BASE?: string;
}

export const onRequest: PagesFunction<ProxyEnv> = async (context) => {
  const { request, params, env } = context;
  const url = new URL(request.url);

  // 构造目标 API Worker URL
  // params.path 是 string[]（catch-all 路径段数组）
  const pathSegments = params.path;
  const path = Array.isArray(pathSegments) ? pathSegments.join("/") : (pathSegments ?? "");
  const targetUrl = `https://yzinvest-ai-api.coollinn.workers.dev/api/${path}${url.search}`;

  // 构造转发请求，清理 hop-by-hop headers
  const headers = new Headers(request.headers);
  headers.delete("host"); // 让 fetch 自动设置正确的 host
  headers.delete("connection");
  headers.delete("keep-alive");
  headers.delete("transfer-encoding");

  const init: RequestInit & { duplex?: string } = {
    method: request.method,
    headers: headers,
    redirect: "follow",
  };

  // GET/HEAD 不能有 body
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  try {
    const response = await fetch(targetUrl, init);
    // 清理响应中的 hop-by-hop headers（如有需要）
    return response;
  } catch (err) {
    return new Response(`API proxy error: ${err instanceof Error ? err.message : String(err)}`, { status: 502 });
  }
};
