# 运维手册 (Ops Runbook)

> 最后更新：2026.05.01
> 生产环境出问题、要查日志、要回滚、要换 secret 时翻这个。按场景索引，每节自包含。

---

## 0. 资源速查

| 资源 | 名字 | 在 Cloudflare Dashboard 的位置 |
|------|------|-------------------------------|
| Pages 项目 | `yzinvest-ai` | Workers & Pages → Pages |
| API Worker | `yzinvest-ai-api` | Workers & Pages → Workers |
| D1 数据库 | `yzinvest` (id `93b45a6b-4635-4138-b64e-11879d833b22`) | Workers & Pages → D1 |
| KV namespace | `yzinvest-cache` (id `3d73c86e689e4edf877e77465ee050b1`) | Workers & Pages → KV |
| Cron triggers | `30 8 * * *` (UTC) | Worker `yzinvest-ai-api` → Triggers |

| URL | 用途 |
|-----|------|
| <https://yzinvest-ai.pages.dev> | 前端线上 |
| <https://yzinvest-ai-api.coollinn.workers.dev> | API Worker（仅 `_worker.js` 内部代理用，不直接给浏览器） |
| <https://github.com/coollinn/yzinvest-ai/actions> | CI/CD 状态 |

---

## 1. 监控 / 健康检查

### 1.1 一分钟体检

```bash
# API 健康检查
curl -s https://yzinvest-ai-api.coollinn.workers.dev/health | jq

# 前端首页
curl -s -o /dev/null -w "%{http_code}\n" https://yzinvest-ai.pages.dev/

# API 通过前端代理（用户视角）
curl -s https://yzinvest-ai.pages.dev/api/health | jq
```

预期：`{"status":"ok","timestamp":"..."}` 或 200。

### 1.2 数据库状态

```bash
cd ~/work/ai-dev-projects/yzinvest-ai
./scripts/manage.sh db-status
```

或手动：

```bash
# 远程 D1 表行数
pnpm --filter @yzinvest/api exec wrangler d1 execute yzinvest --remote \
  --command "SELECT 'stocks' tbl, COUNT(*) n FROM stocks UNION ALL SELECT 'stock_daily', COUNT(*) FROM stock_daily UNION ALL SELECT 'users', COUNT(*) FROM users;"
```

预期：`stocks > 12000`，`users >= 1`。

### 1.3 实时日志（Worker tail）

```bash
pnpm --filter @yzinvest/api exec wrangler tail
```

会持续打印 Worker 收到的请求 / console.log / 错误堆栈。Cmd+C 停止。

> **代理要求**：tail 走 Cloudflare Edge 的 WS，国内必须开代理。

---

## 2. 回滚（生产挂了，先止损）

### 2.1 前端回滚

1. Cloudflare Dashboard → **Pages → yzinvest-ai → Deployments**
2. 找到上一个绿色（Success）的 deployment
3. 右侧 `…` → **Rollback to this deployment**
4. 1 分钟内全球生效（边缘缓存自动失效）

### 2.2 API 回滚

```bash
# 列出最近版本
pnpm --filter @yzinvest/api exec wrangler deployments list

# 回滚到指定版本（替换 <version-id>）
pnpm --filter @yzinvest/api exec wrangler rollback <version-id>
```

或在 Dashboard：**Workers → yzinvest-ai-api → Deployments → Rollback**。

### 2.3 数据库回滚

D1 **没有 point-in-time recovery**，只能靠：

- `data_backup/` 目录里的 JSON 备份（每次 sync 自动生成）
- 自己手动跑的 `wrangler d1 export`（见 §5）

如果 schema 改坏了：回滚迁移 SQL，写一个反向 migration，重新部署。

---

## 3. 部署相关

### 3.1 自动部署（默认）

push 到 `main` → GitHub Actions 自动跑。看 <https://github.com/coollinn/yzinvest-ai/actions>。

| Workflow | 触发条件（path filter） |
|----------|-------------------------|
| `deploy-api.yml` | `apps/api/**`, `packages/shared/**` |
| `deploy-web.yml` | `apps/web/**`, `packages/shared/**` |

### 3.2 手动部署（CI 出问题时的逃生）

```bash
# 后端
pnpm --filter @yzinvest/api build
pnpm --filter @yzinvest/api exec wrangler deploy

# 前端
VITE_API_BASE=/api pnpm --filter @yzinvest/web build
find apps/web/dist -name '._*' -delete
pnpm --filter @yzinvest/web exec wrangler pages deploy dist --project-name yzinvest-ai
```

### 3.3 部署后冒烟测试

```bash
# 必须全部 200 / 200 / 200
curl -s -o /dev/null -w "health: %{http_code}\n" https://yzinvest-ai-api.coollinn.workers.dev/health
curl -s -o /dev/null -w "home:   %{http_code}\n" https://yzinvest-ai.pages.dev/
curl -s -o /dev/null -w "stocks: %{http_code}\n" https://yzinvest-ai.pages.dev/api/stocks?limit=1
```

---

## 4. Secret / 配置管理

### 4.1 查看现有 secret 列表

```bash
pnpm --filter @yzinvest/api exec wrangler secret list
```

不会回显值，只列 key 名。

### 4.2 设置 / 轮换 secret

```bash
# 交互式输入（不会写入 shell history）
pnpm --filter @yzinvest/api exec wrangler secret put JWT_SECRET
# 粘贴新值 → 回车

# 立刻生效；旧值在 Worker 重启后失效
```

需要轮换的关键 secrets：

| Secret | 用途 | 轮换影响 |
|--------|------|----------|
| `JWT_SECRET` | JWT 签名 | 所有用户 token 立刻失效，需重新登录 |
| `TUSHARE_TOKEN` | 旧数据源 | 已弃用，但保留兜底 |
| `CNINFO_COOKIE` | 旧财报源 | 已弃用 |
| `CLOUDFLARE_API_TOKEN`（GitHub Secret）| CI 部署 | CI 失败，需重新生成 + 更新 GitHub |

### 4.3 GitHub Actions Secrets

在 <https://github.com/coollinn/yzinvest-ai/settings/secrets/actions> 维护：

- `CLOUDFLARE_API_TOKEN`（权限：Account → Workers Scripts:Edit + D1:Edit + Pages:Edit）
- `CLOUDFLARE_ACCOUNT_ID`

---

## 5. 数据库备份与恢复

### 5.1 全量导出（推荐每周一次）

```bash
cd ~/work/ai-dev-projects/yzinvest-ai
DATE=$(date +%Y%m%d)
pnpm --filter @yzinvest/api exec wrangler d1 export yzinvest --remote \
  --output "data_backup/d1_full_${DATE}.sql"

# 文件大概几十 MB
ls -lh "data_backup/d1_full_${DATE}.sql"
```

> 需要代理。

### 5.2 仅备份用户数据（小而关键）

```bash
pnpm --filter @yzinvest/api exec wrangler d1 export yzinvest --remote \
  --table users --table notes --table favorites \
  --output "data_backup/users_only_$(date +%Y%m%d).sql"
```

### 5.3 恢复（灾难场景）

```bash
# 假设 SQL 文件在本地
pnpm --filter @yzinvest/api exec wrangler d1 execute yzinvest --remote \
  --file data_backup/d1_full_20260501.sql
```

> ⚠️ 这是 **覆盖性恢复**，会先 DROP 再 CREATE。生产前务必确认。

### 5.4 增量数据修复

股票池数据丢失或脏了：

```bash
./scripts/sync_all.sh           # 全量重刷（约 10 分钟）
# 或
./scripts/sync_resume.sh        # 断点续传
```

详见 [DATA_SYNC_MANUAL.md](./DATA_SYNC_MANUAL.md)。

---

## 6. 常见线上事故处理

### 6.1 API 全部 500

```bash
# 1. 看 tail
pnpm --filter @yzinvest/api exec wrangler tail

# 2. 常见原因：
#    - secret 没设置 → wrangler secret list 检查
#    - D1 schema drift → wrangler d1 migrations list yzinvest --remote
#    - 上次部署引入 bug → §2.2 回滚
```

### 6.2 前端白屏

```bash
# 1. 浏览器 DevTools 看 Console
# 2. 检查 _worker.js 是否在 dist 里
curl -s -I https://yzinvest-ai.pages.dev/_worker.js
# 200 = 已部署；404 = 构建漏了

# 3. 强刷绕过缓存
# Cmd+Shift+R 或无痕窗口
```

### 6.3 登录后立刻被踢出

通常是 `JWT_SECRET` 被换了 → 现有 token 全部失效。让用户重新登录即可。如果不是预期行为：

```bash
# 检查 Worker 内 JWT_SECRET 是否还存在
pnpm --filter @yzinvest/api exec wrangler secret list
```

### 6.4 D1 写入失败 / 慢

D1 Beta 阶段偶有 5xx。重试一次通常 OK。持续问题：

- 看 Cloudflare Status Page：<https://www.cloudflarestatus.com/>
- 切换到 mock 数据兜底（前端做了降级）

### 6.5 KV 读旧值

KV 是 **最终一致性**，多区域同步可能 ~60 秒。
不要用 KV 存关键事务数据，只放缓存 / 限流计数。

---

## 7. 性能问题排查

详见 [PERFORMANCE.md](./PERFORMANCE.md)。最常用三招：

```bash
# 1. 看 Worker 平均响应时间
# Cloudflare Dashboard → Worker → Metrics → CPU time / Duration

# 2. 看 D1 慢查询
pnpm --filter @yzinvest/api exec wrangler d1 insights yzinvest --remote

# 3. 前端 Lighthouse
npx lighthouse https://yzinvest-ai.pages.dev --view
```

---

## 8. 定期任务清单

| 频率 | 任务 |
|------|------|
| **每日**（自动）| Cron `30 8 * * * UTC` 同步股票 + 行情 |
| **每周**（手动）| `./scripts/manage.sh db-status` 看数据量；备份 D1 一次 |
| **每月**（手动）| `pnpm outdated -r` 看依赖；`pnpm audit` 看漏洞 |
| **每季度**（手动）| 全量重刷 stocks（`./scripts/sync_all.sh`） |
| **凭证变更时** | 轮换 `JWT_SECRET` + `CLOUDFLARE_API_TOKEN` |

---

## 9. 紧急联系 & 升级路径

| 场景 | 资源 |
|------|------|
| Cloudflare 平台问题 | <https://www.cloudflarestatus.com/> |
| GitHub Actions 故障 | <https://www.githubstatus.com/> |
| 项目内部 bug | 提 issue：<https://github.com/coollinn/yzinvest-ai/issues> |
| 飞书项目知识库 | folder token `QH6vfK3xalxbNndxUuJc04Uinmg` |

---

## 10. Postmortem 模板（事故复盘）

每次 P0/P1 事故后写一份，存到 `docs/incidents/YYYY-MM-DD-shortname.md`：

```markdown
# 事故复盘：<标题>
- 时间：YYYY-MM-DD HH:MM ~ HH:MM (UTC+8)
- 影响：<受影响的用户/功能>
- 严重等级：P0 / P1 / P2

## 时间线
HH:MM <事件>
HH:MM <动作>
HH:MM <恢复>

## 根因
<一句话>

## 检测
<怎么发现的？是不是太晚？>

## 缓解
<怎么止损的？>

## 修复
<彻底解决方案>

## 经验教训
- 做对了什么
- 做错了什么
- Action items（带 owner 和 deadline）
```
