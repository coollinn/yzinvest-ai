# 架构总览

> 最后更新：2026.05.01
> 一图胜千言。本文回答："请求到了哪里？数据从哪来？凭什么 0 元跑？"

---

## 1. 全栈架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        浏览器（用户）                                    │
│            yzinvest-ai.pages.dev/{stocks, login, ...}                    │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ HTTPS（同源 fetch /api/*）
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                Cloudflare Pages（静态资源 + _worker.js）                  │
│                                                                          │
│  • dist/                      Vite 打包产物（index.html + assets/）      │
│  • _worker.js                 高级模式 Worker：                          │
│       /api/* → 反代到 API Worker                                         │
│       *      → ASSETS.fetch (静态文件 + SPA fallback)                    │
│                                                                          │
│  HTML 响应强制 no-cache，避免旧 bundle 顽固缓存                          │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ /api/* 边缘代理
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│           API Worker（yzinvest-ai-api.coollinn.workers.dev）             │
│                                                                          │
│   Hono Router /api                                                       │
│   ├─ /auth          register / login / refresh / me / logout (JWT)       │
│   ├─ /stocks        list / search / random / quotes / indices / detail   │
│   ├─ /daily         按 range / period 取 K 线（fallback 拉取东财）      │
│   ├─ /financial     四张主报表 + overview（东方财富 datacenter）       │
│   ├─ /favorites     用户收藏（拖拽排序）                                  │
│   ├─ /notes         投研笔记                                              │
│   ├─ /valuation     DCF / CAPM 估值                                       │
│   └─ /admin         dashboard / users / sync (role=admin)                 │
│                                                                          │
│   Middleware: cors / logger / requireAuth / requireAdmin / rateLimit     │
└──────┬───────────────────────────────────┬──────────────────────────────┘
       │                                   │
       │ Drizzle ORM                       │ KV API
       ▼                                   ▼
┌─────────────────┐              ┌────────────────────────┐
│  D1 (SQLite)    │              │  KV (Cache)            │
│  yzinvest       │              │  CACHE                  │
│                 │              │                         │
│  users          │              │  fin:{ts_code}:{type}  │
│  stocks         │              │    财报缓存 24h         │
│  stock_daily    │              │  rl:login:{ip}         │
│  financial_data │              │    限流计数             │
│  notes          │              │  val:{type}:{hash}     │
│  favorites      │              │    估值结果 6h          │
│  valuation_cache│              │                         │
└─────────────────┘              └────────────────────────┘

       ↑                                   ↑
       │ Cron Triggers (每天定时)
       │
┌──────┴──────────────────────────────────────────────────────────────────┐
│  外部数据源（东方财富免费 API）                                           │
│                                                                          │
│  push2.eastmoney.com         实时行情 + 股票列表                         │
│  push2his.eastmoney.com       历史 K 线                                   │
│  datacenter.eastmoney.com    财务报表数据                                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 关键路径：一次"打开股票详情页"发生了什么

```
1. 浏览器：GET https://yzinvest-ai.pages.dev/stocks/000001.SZ
       ▼
2. Pages CDN：返回 index.html（no-cache）+ index-XXXX.js
       ▼
3. Vue Router 匹配 /stocks/:tsCode → 渲染 StockDetail.vue
       ▼
4. ofetch 发起 GET /api/stocks/000001.SZ/detail
       ▼
5. _worker.js 接到请求，发现是 /api/* → 转发到 workers.dev
       ▼
6. API Worker → Hono 路由匹配 → /stocks/:identifier/detail
       ▼
7. Drizzle 查 D1：select stocks where ts_code=...
       ▼
8. 返回 { stock, analysis_data, has_real_data, has_financial_data }
       ▼
9. 前端 TanStack Query 缓存 30s，渲染卡片 + K 线 tab

并行：
  - K 线 tab 请求 /api/daily/000001.SZ?range=3M
       → 后端先查 D1，本地数据不足时调 push2his.eastmoney.com 拉取并落库
  - 财报 tab 请求 /api/financial/000001.SZ/balance-sheet
       → KV 缓存命中直接返回；miss 时调东方财富 datacenter（24h 后过期）
```

---

## 3. 技术栈

### 3.1 前端

| 层 | 选型 | 为什么 |
|----|------|--------|
| 框架 | Vue 3 + `<script setup>` + Composition API | 团队偏好；上手快 |
| 构建 | Vite 5 | 比 webpack 快一个数量级 |
| 路由 | vue-router 4 | 标配 |
| 状态 | Pinia + persistedstate | 标配 + token 持久化 |
| 数据请求 | @tanstack/vue-query + ofetch | 缓存/去重/重试，比 axios 现代 |
| 表单 | VeeValidate + Zod | 与后端共用 schema |
| 样式 | Tailwind CSS 4 + CSS Variables | 极简金融风的颜色全走 var |
| UI 组件 | shadcn-vue（Reka UI 内核）| 复制源码进仓库，可深定制 |
| 图表 | ECharts 5（含 K 线 candlestick）| 性能好、生态全 |
| 图标 | lucide-vue-next | 现代极简风 |
| 工具 | @vueuse/core | dark mode、useTransition 等 |

### 3.2 后端

| 层 | 选型 | 为什么 |
|----|------|--------|
| 运行时 | Cloudflare Workers | 全球边缘 + 免费 10 万次/天 |
| Web 框架 | Hono 4 | 专为 Workers 设计，比 Express 快 4× |
| ORM | Drizzle ORM | 与 D1 兼容、纯 SQL 风格、TypeScript 友好 |
| 数据库 | Cloudflare D1（SQLite）| 5GB / 500 万行读 / 天免费 |
| 缓存 | Cloudflare KV | 1k 写 / 1000 万读 / 天免费 |
| JWT | jose | Web Crypto 原生，零依赖 |
| 密码哈希 | bcryptjs | Workers 兼容（无 native binding）|
| 校验 | Zod | 前后端共用 |
| 部署 | wrangler CLI | 官方 |

### 3.3 跨包

| 资产 | 位置 | 谁用 |
|------|------|------|
| Zod schema | `packages/shared/src/schemas.ts` | 前后端共用输入校验 |
| TS 类型 | `packages/shared/src/types.ts` | 前后端共用响应类型 |
| DCF/CAPM 公式 | `apps/web/src/lib/finance.ts` 和 `apps/api/src/routes/valuation.ts`（同一份逻辑两边都有）| 前端即时计算；后端缓存结果 |

---

## 4. 数据流分类

### 4.1 同步类（每天定时拉到 D1）

| 数据 | 来源 | Cron | 位置 |
|------|------|------|------|
| 股票池 + 当天行情 | 东方财富 push2 (clist/get) | `30 8 * * *` UTC = 北京 16:30 | `apps/api/src/crons/sync-stocks.ts` |
| 日 K 线（fallback）| 东方财富 push2his | 用户访问触发 + 每日补齐 | `apps/api/src/routes/daily.ts` |

### 4.2 按需类（用户访问触发，KV 缓存）

| 数据 | 来源 | 缓存 | 位置 |
|------|------|------|------|
| 财务报表 | 东方财富 datacenter | KV 24h | `apps/api/src/services/eastmoney.ts` |
| DCF 估值结果 | 用户输入 + 公式 | KV 6h（按参数 hash） | `apps/api/src/routes/valuation.ts` |

### 4.3 用户数据（写到 D1）

收藏、笔记、用户表，由用户操作生成，无外部依赖。

---

## 5. 部署拓扑

```
GitHub repo (main 分支)
    │
    │ git push
    ▼
GitHub Actions
    │
    ├─ deploy-api.yml  → wrangler d1 migrations apply → wrangler deploy
    │                                                      │
    │                                                      ▼
    │                                              Cloudflare Workers
    │                                              (yzinvest-ai-api)
    │
    └─ deploy-web.yml  → vite build → wrangler pages deploy
                                          │
                                          ▼
                                     Cloudflare Pages
                                     (yzinvest-ai)
```

详细 CI/CD 流程见飞书 [CI/CD 工作流程详解](https://ucnf0xx1krfg.feishu.cn/docx/LDr9daITcovnm5xPsLocC75cnOf)。

---

## 6. 设计决策（一句话版本）

| 选择 | 一句话理由 |
|------|------------|
| Cloudflare 全栈 vs 传统云 | 全免费 + 全球边缘 + 零运维 |
| Vue 3 vs uni-app | 本期不做小程序，纯 H5 不需要跨端编译开销 |
| Pages `_worker.js` vs Pages Functions | Functions 在 monorepo 部署 dist 时不会一起上传，`_worker.js` 高级模式更可靠 |
| 红涨绿跌 | A 股惯例，国际惯例（绿涨）反而违和 |
| 同源代理 vs CORS | 同源更简单：浏览器只看到 `pages.dev`，不需要 CORS preflight |
| JWT vs session | 无状态，不依赖额外存储；refresh token 7 天 |
| Drizzle vs 原生 SQL | 类型安全，但底层就是 SQL；学习成本最低 |
| KV vs Redis | Workers 原生集成，零启动成本，免费额度足够 |
