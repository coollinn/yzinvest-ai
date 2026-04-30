# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YZInvest AI v2 (智能股票分析平台) — Chinese A-share stock analysis platform. Full rewrite (April 2026) of the legacy FastAPI/Vue 2 project (archived in `legacy/`). Now built on **Cloudflare full stack**: Pages (Vue 3 SPA) + Workers (Hono API) + D1 (SQLite) + KV (cache + ratelimit) + Cron Triggers (daily sync).

Data sources unchanged: Tushare for stock universe + daily price; cninfo.com.cn (scraping) for financial statements.

## Repo Layout (pnpm workspace monorepo)

```
apps/web      Vue 3 + Vite + Tailwind + shadcn-vue → Cloudflare Pages
apps/api      Hono + Drizzle + D1 + KV          → Cloudflare Workers
packages/shared  Zod schemas + TS types (前后端共用)
legacy/       原 FastAPI + Vue 2 代码（仅供查阅，不再维护）
```

## Common Commands

```bash
# 安装（首次）
corepack enable
pnpm install

# 本地开发（两个 terminal）
pnpm dev:api               # wrangler dev → http://localhost:8787
pnpm dev:web               # vite → http://localhost:5173

# 数据库
pnpm db:generate           # drizzle-kit generate (改完 schema.ts 后)
pnpm db:migrate:local      # apply 到本地 D1
pnpm db:migrate:remote     # apply 到远程 D1

# 类型检查
pnpm typecheck             # 全 workspace
pnpm --filter @yzinvest/api typecheck
pnpm --filter @yzinvest/web typecheck

# 构建
pnpm build                 # 全部
pnpm build:web             # 只 web
pnpm build:api             # 只 api

# 部署（手动；CI/CD 自动部署见下文）
pnpm deploy:api
pnpm deploy:web
```

完整部署流程见 [`DEPLOYMENT.md`](./DEPLOYMENT.md)。

## Architecture Highlights

### 鉴权（与 v1 完全不同）

- v1：自定义 session token 走 `?X-Session-Token=xxx` query string
- **v2**：标准 JWT (HS256) 走 `Authorization: Bearer <token>`
- access token 15 分钟，refresh token 7 天，刷新接口 `/api/auth/refresh`
- `GET /api/auth/me` 是真实接口（v1 是前端 mock）

### 涨跌色：A 股惯例（红涨绿跌）

颜色全走 CSS variable（`apps/web/src/styles/globals.css`）：
- `--up: 0 73% 50%` → `#DC2626` 红色（涨）
- `--down: 142 71% 45%` → `#16A34A` 绿色（跌）
- 不要直接写 hex 色值，全部用 `text-up` / `text-down` Tailwind 类
- `colorByChange()` 工具函数（`apps/web/src/lib/utils.ts`）按数值正负返回 class

### 数据同步策略

| 数据源 | 触发 | 实现 |
|---|---|---|
| Tushare 股票池 | Cron `30 8 * * *` (UTC) = 北京 16:30 | `apps/api/src/crons/sync-stocks.ts` |
| Tushare 日线 | 用户访问 `/api/daily/:ts_code` 时 fallback 拉取 + 落库 | `apps/api/src/routes/daily.ts` |
| cninfo 财报 | 用户首访 `/api/financial/:ts_code/...` 触发；24h KV 缓存 | `apps/api/src/services/cninfo.ts` |

### 价格 / 成交量字段

`stock_daily` 表：
- `open` / `high` / `low` / `close` / `pre_close` 都是 RMB
- `vol` 单位是**手**（不是股），`amount` 单位是**千元**
- `change` 是绝对涨跌额，`pct_chg` 是涨跌幅（注意是百分点数值，如 `1.28` 不是 `0.0128`）

### Drizzle Schema 改动 vs v1

- 删 `sessions` 表（无状态 JWT）
- 新增 `valuation_cache` 表（DCF/CAPM 按参数 hash 缓存 6h）
- `users.role` enum (`user` | `admin`) 替代 v1 的 username 包含 "admin" 的 hack
- `notes.tags` json 数组
- `favorites.sort_order` 支持拖拽排序
- 真正的 migrations（`drizzle/migrations/`），改 schema 后跑 `pnpm db:generate`

### Cloudflare Workers 限制注意事项

- 单请求 CPU ≤ 30s（cninfo 单股一般 < 3s 安全；批量同步必须分批）
- bcryptjs cost=10 单次 ~200ms，登录限流 `10/5min`，注册 `10/1h`
- D1 单 SQL 不支持事务跨 statement（drizzle 的 batch 走 D1 batch API）

### 共享 Zod schema

`packages/shared/src/schemas.ts` 是前后端共用的输入校验 schema。改了之后两边都生效，不要分开维护两份。

## Known TODOs

- 增量日线 cron（仅 sync-stocks 已实现）
- DCF 输入回填真实财务数据（目前默认值 hardcoded）
- 命令面板加历史记录 + 键盘高亮
- Lighthouse 性能优化（首屏 prefetch、image lazyload）
- E2E 测试（Playwright）

## Multi-Project Workspace

This repo lives under `/Volumes/work/ai-dev-projects/`. Lark folder for project docs: `QH6vfK3xalxbNndxUuJc04Uinmg`. Repo legacy code in `legacy/` 仅供查阅。
