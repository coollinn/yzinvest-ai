# 安全模型

> 最后更新：2026.05.01
> 鉴权、密钥管理、CORS、限流。安全相关问题先翻这里。

---

## 1. 鉴权方案：JWT (HS256)

### 1.1 Token 设计

| Token | 有效期 | 作用 | 存储位置 |
|-------|--------|------|----------|
| **access_token** | 15 分钟 | 每次请求带在 `Authorization: Bearer ...` | localStorage（前端持久化）|
| **refresh_token** | 7 天 | 换 access_token | localStorage |

### 1.2 Token Payload

```json
// access_token
{
  "sub": "12",                  // user.id
  "username": "leon",
  "role": "admin",
  "iat": 1762923000,
  "exp": 1762923900
}

// refresh_token
{
  "sub": "12",
  "type": "refresh",
  "iat": 1762923000,
  "exp": 1763527800
}
```

### 1.3 接入位置

| 模块 | 位置 |
|------|------|
| 签发 / 校验 | [`apps/api/src/lib/jwt.ts`](../apps/api/src/lib/jwt.ts) |
| middleware | [`apps/api/src/middleware/auth.ts`](../apps/api/src/middleware/auth.ts) |
| 注册/登录/刷新 | [`apps/api/src/routes/auth.ts`](../apps/api/src/routes/auth.ts) |
| 前端注入 token | [`apps/web/src/lib/api.ts`](../apps/web/src/lib/api.ts) `onRequest` |

### 1.4 三个 middleware

```ts
requireAuth     // 必须有有效 access_token，否则 401
requireAdmin    // 在 requireAuth 之后；user.role !== 'admin' 抛 403
optionalAuth    // 有 token 就解析（设置 c.get('user')），没 token 也放行
```

### 1.5 用户体验上的细节

- 登录成功 → access + refresh 写入 localStorage
- 每次请求自动加 `Authorization` 头
- 收到 401 → 前端自动清 token，重定向到 `/login?redirect=...`
- access_token 过期 → 前端可主动调 `/api/auth/refresh` 续命（当前未自动续期，TODO）

### 1.6 注销

`POST /api/auth/logout` 目前是空操作（无状态 JWT 没有服务端 session 可清）。前端只是把 localStorage 清掉。

> 如需"立即吊销 token"，可在 KV 加黑名单：每个失效 token 写入 KV，TTL = token 剩余有效期；middleware 校验时先查 KV。

---

## 2. 密码存储：bcryptjs

```ts
// 注册时
const hash = await bcrypt.hash(plaintext, 10);   // cost=10

// 登录时
const ok = await bcrypt.compare(plaintext, user.password_hash);
```

- 选 **bcryptjs** 而非 native bcrypt：Workers 不能加载 native binding
- cost=10 在 Workers 上单次约 200ms，可接受
- **永远不在日志或响应里返回 password_hash**

---

## 3. Secrets 管理

### 3.1 三层 secret

```
┌──────────────────────────────────┐
│  GitHub Repository Secrets       │   只 CI 用
│  ────────────────────────────    │
│  CLOUDFLARE_API_TOKEN            │   wrangler 部署用
│  CLOUDFLARE_ACCOUNT_ID            │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│  Cloudflare Workers Secrets       │   Worker runtime 用
│  ────────────────────────────    │
│  JWT_SECRET                      │   签 JWT 用，32 bytes hex
│  TUSHARE_TOKEN                   │   Tushare API（已弃用，保留）
│  CNINFO_COOKIE                   │   抓 cninfo 财报用
└──────────────────────────────────┘

┌──────────────────────────────────┐
│  本地 .dev.vars                   │   只 wrangler dev 用，gitignore
│  ────────────────────────────    │
│  同上 3 项                        │
└──────────────────────────────────┘
```

### 3.2 设置 Workers Secret

```bash
cd apps/api
pnpm exec wrangler secret put JWT_SECRET
# 粘贴 32 字节 hex（用 openssl rand -hex 32 生成）

pnpm exec wrangler secret put CNINFO_COOKIE
# 粘贴浏览器 DevTools 抓的 Cookie

# 列出
pnpm exec wrangler secret list

# 删除
pnpm exec wrangler secret delete <name>
```

### 3.3 GitHub Repository Secrets

GitHub repo → Settings → Secrets and variables → Actions → New repository secret。

- `CLOUDFLARE_API_TOKEN` → 在 Cloudflare → My Profile → API Tokens 创建：
  - 模板：**Edit Cloudflare Workers**
  - 加权限：`Account / Cloudflare Pages / Edit`、`Account / D1 / Edit`
- `CLOUDFLARE_ACCOUNT_ID` → Cloudflare Dashboard 右下角

### 3.4 关键禁忌

| 禁忌 | 原因 |
|------|------|
| 把 secret 写进 `wrangler.toml` 的 `[vars]` | `wrangler.toml` 进 git，会泄漏 |
| 把 `.dev.vars` 提交 | 同上 |
| 把 secret 拼到 URL（如 `?token=xxx`）| URL 会进日志、Referer header |
| 在 console.log 里打印 secret | Worker tail / GitHub Actions log 会留痕 |

---

## 4. CORS 策略

### 4.1 配置

[`apps/api/src/index.ts`](../apps/api/src/index.ts) 顶部：

```ts
app.use("*", async (c, next) => {
  const allowed = (c.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => {
      if (!origin) return undefined;
      if (allowed.includes("*") || allowed.includes(origin)) return origin;
      return undefined;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  })(c, next);
});
```

### 4.2 白名单

[`apps/api/wrangler.toml`](../apps/api/wrangler.toml)：

```toml
[vars]
CORS_ORIGINS = "https://yzinvest-ai.pages.dev,http://localhost:5173"
```

只允许：
- 生产前端域名
- 本地 dev 端口

加新域名（如 PR 预览）时，更新这里再 redeploy API。

### 4.3 同源代理（推荐做法）

**生产环境实际上不依赖 CORS**：浏览器只访问 `yzinvest-ai.pages.dev`，所有 `/api/*` 请求被 `_worker.js` 边缘代理到 Worker，浏览器视角是同源请求。

CORS 只为本地开发（vite proxy 不影响）和未来跨域调用预留。

---

## 5. 限流（Rate Limit）

### 5.1 实现

[`apps/api/src/middleware/ratelimit.ts`](../apps/api/src/middleware/ratelimit.ts) 滑动窗口，存在 KV：

```ts
rateLimit({ windowSeconds: 300, max: 10, prefix: "login" })
// 5 分钟内同一 IP 最多 10 次登录尝试
```

### 5.2 已挂载的端点

| 端点 | 窗口 | 上限 | 防什么 |
|------|------|------|--------|
| `POST /api/auth/register` | 1 小时 | 10 次 | 大批量注册 |
| `POST /api/auth/login` | 5 分钟 | 10 次 | 暴力破解密码 |

### 5.3 触发后

返回 `429 Rate limit exceeded, please try again later`。

### 5.4 扩展点

- 业务级别限流（如 `/api/admin/sync/stocks` 应该限制每天最多 N 次）
- 按 user_id 限流（不只按 IP）
- 全局保护（防 DDoS） — Cloudflare 平台自带，免费档已包含

---

## 6. 输入校验

所有 POST/PUT 请求体必须经过 [`packages/shared/src/schemas.ts`](../packages/shared/src/schemas.ts) 的 Zod 校验。

```ts
import { LoginRequest } from "@yzinvest/shared";

app.post("/login", async (c) => {
  const body = LoginRequest.parse(await c.req.json());
  // body 类型已自动收窄
  ...
});
```

校验失败会被 Hono `onError` 捕获，返回 422 + `error.issues`，前端能拿到字段级错误。

---

## 7. SQL 注入

Drizzle ORM 全程参数化绑定，**无 SQL 注入风险**。永远不要拼接 SQL：

```ts
// ❌ 千万别
db.run(sql`SELECT * FROM users WHERE name = '${input}'`);

// ✅
db.select().from(users).where(eq(users.name, input));
```

---

## 8. XSS

Vue 默认转义所有 `{{ }}` 输出，无 XSS 风险。
**只有 `v-html` 需要警惕**，本项目目前没用 `v-html`，未来如要加（如笔记 Markdown 渲染），必须先用 sanitize-html 之类清洗。

---

## 9. 数据出口

| 数据 | 是否对外暴露 | 备注 |
|------|--------------|------|
| `users.password_hash` | ❌ 永远不返回 | 注册/登录响应里也不带 |
| `users.email` | 仅本人看到 (`/api/auth/me`) | 不在公开列表暴露 |
| `users.role` | 自己 + admin 可见 | admin 列表 `/api/admin/users` |
| 别人的 notes / favorites | ❌ 严格按 user_id 过滤 | 中间件 + Drizzle where |
| 股票数据 | ✅ 全公开 | 没有用户隐私 |

后端所有"用户私有"路由用 `requireAuth` + Drizzle where 双重过滤。

---

## 10. 审计 + 日志

- Hono `logger` middleware 把每个请求记到 stdout
- 用 `wrangler tail` 实时看 Worker 日志
- Cloudflare Dashboard → Workers → Logs 可看历史（保留 24h，付费可延长）
- **永远不在日志里打印 secret 或密码**

---

## 11. 安全自检清单

部署生产前过一遍：

- [ ] `wrangler.toml` 没有任何 secret
- [ ] `git log -p | grep -iE "token|secret|key|password"` 输出干净
- [ ] `JWT_SECRET` 是 32 字节随机 hex（不是 dev-secret 这种）
- [ ] `CORS_ORIGINS` 没含 `*`
- [ ] admin 路由前都有 `requireAdmin`
- [ ] 用户私有路由都有 user_id 过滤
- [ ] `.gitignore` 包含 `.dev.vars` 和 `.env*`
- [ ] 注册/登录都挂了 rate limit
- [ ] Cloudflare API Token 权限只到必要的（不是 Global Admin）

---

## 12. 上报安全漏洞

发现安全问题请直接联系仓库 owner，不要在 GitHub Issue 公开。
