export async function onRequest(context: EventContext<any, any, any>) {
  const { request, params } = context;
  const url = new URL(request.url);
  
  // 构造目标 API Worker URL
  const path = params.path ? (Array.isArray(params.path) ? params.path.join("/") : params.path) : "";
  const targetUrl = `https://yzinvest-ai-api.coollinn.workers.dev/api/${path}${url.search}`;

  // 转发请求，保留 method、headers 和 body
  const headers = new Headers(request.headers);
  // 修改 host 为目标 host
  headers.set("host", "yzinvest-ai-api.coollinn.workers.dev");

  const init: RequestInit = {
    method: request.method,
    headers: headers,
    redirect: "follow",
  };

  // GET/HEAD 不能有 body
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    (init as any).duplex = "half";
  }

  try {
    const response = await fetch(targetUrl, init);
    // 返回响应，保留 CORS headers
    return response;
  } catch (err) {
    return new Response(`API proxy error: ${err.message}`, { status: 502 });
  }
}
