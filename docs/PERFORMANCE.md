# 性能指南

> 最后更新：2026.05.01
> 本文档汇总：当前性能现状、瓶颈分析、优化手段、监控指标。

---

## 1. 性能目标

### 1.1 前端

| 指标 | 目标 | 当前（估算）|
|------|------|-------------|
| LCP（最大内容渲染）| < 2.5s | ~3s |
| FID / INP | < 200ms | OK |
| CLS（累计布局偏移）| < 0.1 | ~0.05 |
| Lighthouse Performance | ≥ 90 | ~80 |
| Lighthouse Accessibility | ≥ 95 | ~90 |
| 首屏 JS 大小（gzip）| < 200KB | ~280KB |

### 1.2 后端

| 指标 | 目标 |
|------|------|
| `/api/stocks` p95 | < 200ms |
| `/api/daily/:ts_code` p95 | < 500ms（缓存命中）/ < 2s（穿透到东方财富）|
| `/api/financial/:ts_code/overview` p95 | < 800ms |
| Worker CPU per request p95 | < 50ms（强限制 30s）|
| 错误率 | < 0.1% |

---

## 2. Cloudflare 平台限制（必读）

| 限制 | 数值 | 影响 |
|------|------|------|
| Workers Free CPU 上限 | 10ms（含子请求等待）| 业务逻辑必须紧凑 |
| Workers Free 单请求 CPU | 50ms | bcryptjs cost=10 大约 200ms ⚠️|
| Workers Paid CPU 上限 | 30s | cninfo 抓取 < 3s 安全 |
| D1 单查询超时 | 30s | 复杂 join 注意 |
| D1 单批 statements | < 100 | 同步脚本分批导入 |
| KV 写延迟 | 最终一致 ~60s | 不能存事务数据 |
| Pages 静态资源 | 25 MiB / 文件，1000 req/min/ip | 字体 / 图片注意 |

### 2.1 bcryptjs 在 Workers 的注意

cost=10 单次 ~200ms。Workers Free 限 50ms CPU 时间会被杀。
**当前用 Paid 30s 上限，没问题；**但也设置了 `auth/login` `10/5min` KV 限流防爆破。

替代方案（未来）：scrypt 或 PBKDF2-SHA256（`crypto.subtle`）—— 走 Web Crypto 不消耗 CPU 时间。

---

## 3. 前端优化

### 3.1 Bundle 体积

```bash
# 看构建后产物
pnpm --filter @yzinvest/web build
ls -lh apps/web/dist/assets/*.js
```

当前主要大块：

| 包 | 大小（gzip）| 优化 |
|----|-------------|------|
| `vue` + 路由 + Pinia | ~50KB | 已是最低 |
| `echarts` core | ~120KB | 按需引入（已做）|
| `klinecharts-pro` | ~80KB | 计划仅 K 线页 lazy import |
| `lucide-vue-next` | ~20KB | 已 tree-shaken |
| 业务代码 | ~30KB | 路由级 split |

### 3.2 路由级代码分割

`apps/web/src/router/index.ts`：

```ts
{ path: '/stocks/:tsCode', component: () => import('@/pages/StockDetail.vue') }
```

页面组件用动态 import → 自动 chunk。

### 3.3 图片 / 字体

- 不打包字体，走 CSS `font-family: -apple-system, ...`
- 图标全用 SVG（lucide），不用图标字体
- 股票 logo 暂未实现，未来用 `<img loading="lazy">` 加 webp

### 3.4 关键 CSS（critical CSS）

Vite 默认会内联首屏关键 CSS。检查 `apps/web/dist/index.html`：

```bash
grep -c '<style' apps/web/dist/index.html   # 应有 ≥1
```

### 3.5 prefetch / preload

Vite 自动给路由 chunks 加 `<link rel="modulepreload">`。手动场景：

```html
<link rel="prefetch" href="/api/stocks?limit=20">
```

### 3.6 数据请求

- TanStack Query 自动 dedupe + cache
- staleTime 默认设 30s（行情类）/ 5min（财报类）
- 不在 mounted 串行，多请求 `Promise.all`

### 3.7 React-style 大列表 → 虚拟化

当前股票列表 12k+ 行，已用 TanStack Table + 客户端分页（每页 20）。
未来如需"无限滚动"：考虑 `@tanstack/vue-virtual`。

---

## 4. 后端优化

### 4.1 减少子请求

Worker 计费按 **CPU 时间** 而不是 wall time，但子请求（fetch / D1）等待算 **subrequest**，免费版每请求 50 个上限。

不要循环 SELECT；批 IN 查询一次：

```ts
// ❌ 慢
for (const tsCode of tsCodes) {
  await db.select().from(stocks).where(eq(stocks.tsCode, tsCode));
}

// ✅ 快
await db.select().from(stocks).where(inArray(stocks.tsCode, tsCodes));
```

### 4.2 D1 索引

`apps/api/src/db/schema.ts` 已声明的索引：

| 表 | 索引 | 用途 |
|----|------|------|
| `stocks` | `industry_idx`、`cnspell_idx` | 行业筛选 / 拼音搜索 |
| `stock_daily` | `ts_code_date_idx (ts_code, trade_date)` | K 线区间查询 |
| `financial_data` | `ts_code_period_idx (ts_code, period)` | 财报取最新期 |
| `notes` | `user_id_idx` | 当前用户笔记 |
| `favorites` | `user_id_sort_idx (user_id, sort_order)` | 收藏排序 |

新增高频查询前 → 先 EXPLAIN：

```bash
pnpm --filter @yzinvest/api exec wrangler d1 execute yzinvest --remote \
  --command "EXPLAIN QUERY PLAN SELECT * FROM stocks WHERE industry='银行' LIMIT 10"
```

看到 `SCAN TABLE stocks` 而不是 `SEARCH TABLE` → 缺索引。

### 4.3 KV 缓存策略

```ts
// 财报 24h 缓存
const cacheKey = `financial:${tsCode}:overview`;
const cached = await env.KV.get(cacheKey, 'json');
if (cached) return c.json(cached, 200, { 'x-cache': 'HIT' });

const data = await cninfoFetch(tsCode);
await env.KV.put(cacheKey, JSON.stringify(data), { expirationTtl: 86400 });
return c.json(data, 200, { 'x-cache': 'MISS' });
```

### 4.4 Cron 分批

每日同步 12k+ 股票，单 Worker 30s 不够。`crons/sync-stocks.ts` 分批 100 个：

```ts
const batches = chunk(stocks, 100);
for (const batch of batches) {
  await Promise.all(batch.map(syncOne));
}
```

但 Cron 仍是同一 Worker 实例 30s 上限 → 拆成多个 cron 错峰：

```toml
# wrangler.toml
[[triggers.crons]]
schedule = "30 8 * * *"   # 同步股票池
[[triggers.crons]]
schedule = "35 8 * * *"   # 同步行情 1/3
[[triggers.crons]]
schedule = "40 8 * * *"   # 同步行情 2/3
```

### 4.5 限流

`middleware/ratelimit.ts` 用 KV 滑动窗口：

```ts
// 关键端点配额
'/api/auth/login':    10 per 5min per IP
'/api/auth/register': 10 per 1h  per IP
'/api/admin/sync/*':  5  per 1h  per IP
```

KV 写延迟最终一致，所以这是 **软限流**（防爆破即可，不是精确反 DDoS）。

---

## 5. 数据库性能

### 5.1 索引检查

```bash
# 列出所有索引
pnpm --filter @yzinvest/api exec wrangler d1 execute yzinvest --remote \
  --command "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND tbl_name NOT LIKE 'sqlite_%';"
```

### 5.2 慢查询

D1 Insights（Beta）：

```bash
pnpm --filter @yzinvest/api exec wrangler d1 insights yzinvest --remote
```

或自己加 timing log：

```ts
const t0 = Date.now();
const rows = await db.select()...;
console.log('q', sqlName, Date.now() - t0, 'ms');
```

### 5.3 表大小估算

D1 是 SQLite，单库 10GB 上限。当前：

| 表 | 估计行数 | 估计大小 |
|----|----------|----------|
| `stocks` | ~12k | 5MB |
| `stock_daily` | ~12k * 365天 ≈ 4M+ | 1GB（多年累积要警惕）|
| `financial_data` | ~12k * 4季 * 4表 ≈ 200k | 100MB |
| `notes` / `favorites` | < 1k | 忽略 |

**`stock_daily` 长期可能超限** → 未来考虑分库或归档冷数据。

---

## 6. 网络层 / CDN

### 6.1 边缘缓存

Pages 默认开 CDN，静态资源（hash 命名的 JS/CSS）有 1 年缓存。
HTML 主动加 `Cache-Control: no-cache`（在 `_worker.js` 里），保证更新立刻生效。

### 6.2 API 响应缓存

部分公开数据用 `Cache-Control` + Cloudflare Cache API：

```ts
const cache = caches.default;
const cacheKey = new Request(url, request);
let resp = await cache.match(cacheKey);
if (!resp) {
  resp = await handle(...);
  resp.headers.set('cache-control', 'public, max-age=300');
  await cache.put(cacheKey, resp.clone());
}
return resp;
```

适用于：股票列表、行业枚举、上证指数等。**用户私有数据不要这样做**。

### 6.3 压缩

Cloudflare 默认开 gzip / brotli，Worker 不用手动压。

---

## 7. 监控

### 7.1 Cloudflare Analytics

Dashboard → **Analytics & Logs** → **Workers Analytics**。能看：

- 请求量 / 错误率
- p50 / p95 / p99 延迟
- CPU 时间分布
- 子请求次数

### 7.2 Real User Monitoring（计划）

`apps/web/src/main.ts` 接入：

```ts
import { onLCP, onFID, onCLS } from 'web-vitals';

onLCP((m) => fetch('/api/_vitals', { method: 'POST', body: JSON.stringify(m) }));
```

后端写到 KV，定期归档到 D1 表 `web_vitals`。

### 7.3 错误上报（计划）

Sentry 太重。考虑自建：Worker 路由 `/api/_err` 收集前端错误 → KV → 每日邮件汇总。

---

## 8. 性能调优工作流

```
观测 → 找瓶颈 → 改 → 量化收益 → 重复
```

### 8.1 用 Lighthouse 抓基线

```bash
npx lighthouse https://yzinvest-ai.pages.dev --view --output html
```

存 baseline 报告：`docs/perf-baseline-YYYYMMDD.html`。

### 8.2 用 Chrome DevTools Performance 看渲染

- Record → 操作 → Stop
- 关注 Long Task（> 50ms）和 Layout / Recalculate Style

### 8.3 用 `wrangler tail` 看 API 延迟

```bash
pnpm --filter @yzinvest/api exec wrangler tail | grep -E '(GET|POST)' | awk '{print $NF}'
```

---

## 9. 已知性能 todo

- [ ] 首屏 JS 体积 280KB → 目标 200KB（拆 echarts、lazy klinecharts）
- [ ] `/api/stocks` 全表扫 → 加分页 OFFSET 优化（KEYSET pagination）
- [ ] DCF/CAPM 服务端缓存（valuation_cache 表已建，未接入）
- [ ] D1 慢查询定期 review（季度一次）
- [ ] Lighthouse CI 自动跑 PR

---

## 10. 反模式（不要做）

- ❌ 在 Worker 里跑 sync 加密（用 Web Crypto async）
- ❌ for 循环里 await db 查询（批查或 Promise.all）
- ❌ 把整个股票池一次返回前端（分页，永远）
- ❌ 用 KV 存频繁写的计数（用 D1 + UPSERT 或 Durable Objects）
- ❌ 在 SSR / Worker 引入 Node.js 内置模块（`fs`, `child_process`）
