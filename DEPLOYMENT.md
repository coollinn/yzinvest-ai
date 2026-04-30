# 部署到 Cloudflare（首次配置 + 之后自动）

YZInvest AI v2 全栈部署到 Cloudflare 全免费托管：Pages + Workers + D1 + KV + Cron Triggers。

## 1. 一次性 Cloudflare 资源准备（人工操作）

```bash
# 登录 Cloudflare（浏览器 OAuth）
npx wrangler login

# 创建 D1 数据库（输出含 database_id）
npx wrangler d1 create yzinvest

# 创建 KV namespace（输出含 id）
npx wrangler kv namespace create CACHE
```

把 `database_id` 和 `kv namespace id` 填到 `apps/api/wrangler.toml` 的对应 `PLACEHOLDER` 位置。

## 2. 设置 Workers Secrets（不会进 git）

```bash
cd apps/api

npx wrangler secret put TUSHARE_TOKEN
# 粘贴 Tushare API token

npx wrangler secret put JWT_SECRET
# openssl rand -hex 32 → 粘贴

npx wrangler secret put CNINFO_COOKIE
# 从 cninfo.com.cn 浏览器 DevTools 复制 Cookie 全文
```

## 3. 推送 schema 到远程 D1

```bash
cd apps/api
pnpm db:generate          # 生成 SQL migrations 到 drizzle/migrations/
pnpm db:migrate:remote    # 应用到远程 D1
```

也可以应用到本地 D1（`pnpm db:migrate:local`）方便本地开发。

## 4. 首次手动部署（验证一切就绪）

```bash
# 后端
cd apps/api
npx wrangler deploy
# → 输出 https://yzinvest-ai-api.<ACCOUNT>.workers.dev

# 前端
cd ../web
pnpm build
npx wrangler pages deploy dist --project-name=yzinvest-ai
# → 输出 https://yzinvest-ai.pages.dev
```

记得把前端构建用的 `VITE_API_BASE` 改成实际的 Worker URL（在 `.github/workflows/deploy-web.yml` 已设置，本地可通过 `.env.local` 覆盖）。

## 5. 启用 GitHub Actions 自动部署

在 GitHub repo Settings → Secrets and variables → Actions → New repository secret 添加：

- `CLOUDFLARE_API_TOKEN` — Cloudflare 控制台 → My Profile → API Tokens → 创建：
  - 模板：`Edit Cloudflare Workers`
  - 权限补充：`Account: Cloudflare Pages: Edit`、`Account: D1: Edit`
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare Dashboard 右下角 Account ID

之后：
- `git push origin main` → 自动触发 `deploy-api.yml` + `deploy-web.yml`
- PR → 自动建 preview 环境 `https://<branch>.yzinvest-ai.pages.dev`

## 6. 同步初始数据

部署完后调用 admin 接口初始化股票池（也可以等 cron 跑）：

```bash
# 1. 注册第一个用户（任何端点都行，比如本地 curl）
curl -X POST https://yzinvest-ai-api.<account>.workers.dev/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","email":"a@b.com","password":"changeme123"}'
# 拿到 access_token

# 2. 在远程 D1 把这个用户 role 改成 admin
npx wrangler d1 execute yzinvest --remote --command "UPDATE users SET role='admin' WHERE username='admin'"

# 3. 触发同步
curl -X POST https://yzinvest-ai-api.<account>.workers.dev/api/admin/sync/stocks \
  -H 'Authorization: Bearer <access_token>'
```

之后 cron 每天 16:30 自动同步。

## 7. 验证

```bash
# 健康检查
curl https://yzinvest-ai-api.<account>.workers.dev/health

# 看股票数（远程 D1）
npx wrangler d1 execute yzinvest --remote --command "SELECT COUNT(*) FROM stocks"

# 浏览器打开 https://yzinvest-ai.pages.dev
```

## 故障排查

- **D1 migration 失败**：检查 `wrangler.toml` 里 `database_id` 是否正确；migrations 文件是否生成
- **CORS 错误**：`apps/api/wrangler.toml` 的 `CORS_ORIGINS` 必须包含前端域名
- **cninfo cookie 失效**：浏览器重抓 → `wrangler secret put CNINFO_COOKIE` 重设
- **Tushare 限流**：免费账号每分钟 200 次；同步时如遇限流，错峰或降批
- **bcrypt 慢**：cost=10 单次 ~200ms 在 Workers 上正常

## 免费额度提醒

| 资源 | 免费额度 | 估算撑得住的规模 |
|---|---|---|
| Workers requests | 10万/天 | 1000 日活，平均 100 req/user |
| D1 存储 | 5GB | 20年的全市场日线 + 财报 |
| D1 读 | 500万行/天 | 同上 |
| Pages | 无限请求 + 500 build/月 | 任意 |
| KV | 1000万读/天，1k 写/天，1GB | 财报缓存 + 限流计数 |

爆额度前会先邮件预警。

## 域名（可选升级）

- 默认：`*.pages.dev` + `*.workers.dev`，免费
- 自有域名：`Cloudflare Registrar` 注册（~$10/年），自动 SSL，绑定到 Pages/Workers
