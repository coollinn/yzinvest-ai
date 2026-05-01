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

## CI/CD 避坑指南（核心经验）

> 以下经验来自实际部署踩坑，后续开发必须注意。

### 坑1：前端 API 路径不匹配

- **现象**：前端调用 `/auth/login`，但 API Worker 路由为 `/api/auth/login` → 404
- **根因**：`VITE_API_BASE` 未设置，前端直接拼接 `/auth/login`
- **修复**：在 `deploy-web.yml` 构建步骤中设置 `VITE_API_BASE=/api`
- **后续注意**：本地开发通过 `apps/web/.env.local` 覆盖；**永远不要在构建时使用绝对 URL 指向 workers.dev**

### 坑2：浏览器无法访问 *.workers.dev

- **现象**：前端登录报错 `Failed to fetch`，直接 curl workers.dev 超时
- **根因**：国内/公司网络拦截 `*.workers.dev` 域名
- **修复**：使用 `_worker.js` 在边缘代理所有 `/api/*` 请求，浏览器只访问 `*.pages.dev`
- **后续注意**：API Worker 的 `workers.dev` 域名仅用于内部代理，**不要直接暴露给客户端**

### 坑3：GitHub Actions Node 24 兼容性

- **现象**：CI 报错 `--no-experimental-fetch is an invalid negation`
- **根因**：`NODE_OPTIONS=--no-experimental-fetch` 和 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` 在 Node 22+ 已无效
- **修复**：移除所有 Node 24 强制配置，工作流直接使用 Node 22
- **后续注意**：monorepo + pnpm 项目建议固定 Node 20-22，不要混用版本标志

### 坑4：wrangler-action 在 pnpm monorepo 中安装失败

- **现象**：`cloudflare/wrangler-action@v3` 报错 `ERR_PNPM_ADDING_TO_ROOT`
- **根因**：wrangler-action 内部 `npm install` 与 pnpm 工作区冲突
- **修复**：移除 wrangler-action，改用 `npm install -g wrangler@3.114.17` 直接安装，然后调用 `wrangler` CLI
- **后续注意**：在 monorepo + pnpm 项目中，**尽量避免使用需要注入依赖的 GitHub Action**，优先使用全局 CLI 工具

### 坑5：Cloudflare Pages Functions 未被正确部署

- **现象**：`apps/web/functions/` 目录的代码部署后不生效
- **根因**：`wrangler pages deploy apps/web/dist` 只上传 `dist/` 目录内的文件，不会包含源代码目录中的 Functions
- **修复**：切换为 `_worker.js` 方案，放入 `apps/web/public/` 目录，构建后自动进入 `dist/`，触发 Pages 高级模式
- **后续注意**：`functions/` 目录在 `wrangler pages deploy` 中**不会被上传**；如需边缘逻辑，必须用 `_worker.js` 高级模式

### 坑6：浏览器缓存旧 bundle 导致修复不生效

- **现象**：修复 `VITE_API_BASE` 后，用户访问网站仍使用旧版本代码
- **根因**：Cloudflare CDN + 浏览器 Service Worker 缓存了旧的 `index.html` 和 bundle JS 文件
- **修复**：在 `_worker.js` 中为所有 `text/html` 响应添加 `Cache-Control: no-cache, no-store, must-revalidate` 和 `Pragma: no-cache` 头
- **后续注意**：生产环境重要 Bug 修复后，**必须通知用户 Cmd+Shift+R 强刷或用无痕窗口**；也可考虑版本化文件名（Vite 默认已做 hash）

### 坑7：AppleDouble 文件污染 dist 目录

- **现象**：macOS 系统文件（如 `._optimizer.css`）被意外打包进 `dist`
- **根因**：Vite 构建时保留了 macOS 生成的 AppleDouble 隐藏文件
- **修复**：CI 中添加清理步骤：`find apps/web/dist -name '._*' -delete`
- **后续注意**：在 `.gitignore` 中添加 `**/._*` 防止这些文件进入版本库

### 关键配置速查

| 文件 | 关键配置项 | 说明 |
|------|------------|------|
| `apps/web/.env.production` | `VITE_API_BASE=/api` | 前端 API 路径前缀（相对路径）|
| `apps/web/public/_worker.js` | `API_WORKER` 常量 | 指向 API Worker 的 workers.dev 地址 |
| `apps/api/wrangler.toml` | `CORS_ORIGINS` | 必须包含前端域名（pages.dev + localhost）|
| `.github/workflows/deploy-web.yml` | `VITE_API_BASE` env | 构建时注入，与 wrangler.toml 的 CORS_ORIGINS 对应 |
| `.github/workflows/deploy-api.yml` | `wrangler d1 migrations apply` | 每次部署自动应用 D1 migration |
