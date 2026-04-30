# YZInvest AI

智能股票分析平台 — 基于 Cloudflare 全栈的现代化 A 股分析工具。

```
┌─ apps/web   Vue 3 + Vite + Tailwind + shadcn-vue → Cloudflare Pages
├─ apps/api   Hono + Drizzle + D1 + KV          → Cloudflare Workers
└─ packages/shared  共享类型 + Zod schema
```

## 快速开始

```bash
# 1. 安装
corepack enable
pnpm install

# 2. 启动 API（本地 D1）
pnpm --filter @yzinvest/api db:migrate:local
pnpm dev:api      # http://localhost:8787

# 3. 启动 Web
pnpm dev:web      # http://localhost:5173
```

## 部署到 Cloudflare（首次配置）

详见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

简要步骤：

```bash
# 1. Cloudflare 登录
npx wrangler login

# 2. 创建 D1 + KV
npx wrangler d1 create yzinvest                  # 拿 database_id 填进 apps/api/wrangler.toml
npx wrangler kv namespace create CACHE           # 拿 id 填进 apps/api/wrangler.toml

# 3. 设置 secrets
cd apps/api
npx wrangler secret put TUSHARE_TOKEN
npx wrangler secret put JWT_SECRET               # openssl rand -hex 32
npx wrangler secret put CNINFO_COOKIE

# 4. 推送数据库 schema
pnpm db:generate
pnpm db:migrate:remote

# 5. 部署
pnpm deploy:api
pnpm deploy:web

# 6. GitHub Actions 自动部署：在 GitHub repo Settings → Secrets 添加：
#    - CLOUDFLARE_API_TOKEN
#    - CLOUDFLARE_ACCOUNT_ID
#    之后 git push origin main 自动触发部署
```

## 技术栈

- **前端** Vue 3 / Vite / TypeScript / Tailwind / shadcn-vue / TanStack Query / ECharts / klinecharts-pro
- **后端** Hono / Drizzle ORM / Cloudflare D1 / Cloudflare KV / Cron Triggers / jose (JWT) / bcryptjs
- **共享** Zod schema (前后端共用)
- **数据源** Tushare API（股票池/日线）+ cninfo.com.cn（财报爬取）

## 项目命令

| 命令 | 说明 |
|---|---|
| `pnpm dev:api` | 启动 API 本地开发服务（wrangler dev） |
| `pnpm dev:web` | 启动 Web 本地开发服务（Vite） |
| `pnpm build` | 构建所有 app |
| `pnpm db:generate` | 生成 Drizzle migrations |
| `pnpm db:migrate:local` | 应用 migrations 到本地 D1 |
| `pnpm db:migrate:remote` | 应用 migrations 到远程 D1 |
| `pnpm deploy:api` | 部署 API 到 Workers |
| `pnpm deploy:web` | 部署 Web 到 Pages |
| `pnpm typecheck` | 类型检查 |

## 旧版本

旧的 FastAPI + Vue 2 风格代码归档在 [`legacy/`](./legacy/) 子目录。仅供查阅，不再维护。
