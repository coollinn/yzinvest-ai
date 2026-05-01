# 更新日志

> 最后更新：2026.05.01
> 项目所有可见变更按版本时间倒序记录。遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

每次合并 PR 后，给 `Unreleased` 节追加一行；发布时把 `Unreleased` 整体改成版本号 + 日期。

---

## [Unreleased]

### Added
- 文档库扩充：`CONTRIBUTING.md`、`GLOSSARY.md`、`OPS_RUNBOOK.md`、`TESTING.md`、`PERFORMANCE.md`、`CHANGELOG.md`（本文件）
- 文档统一更新时间格式（`YYYY.MM.DD`）

---

## [0.2.1] - 2026-05-01

### Added
- API 文档（`docs/API.md`）覆盖全部端点
- 数据接入策略文档（`docs/DATA_GUIDE.md`）
- 数据同步操作手册（`docs/DATA_SYNC_MANUAL.md`）
- 项目管理脚本（`scripts/manage.sh`、`sync_all.sh`、`sync_incremental.sh`、`sync_resume.sh`）
- JSON 备份机制（`data_backup/` 目录，每次同步自动产出）

### Fixed
- 东方财富 API 字段单位修正（价格分→元，成交额单位）
- 东方财富 API 网络错误处理（停牌股 `f4='-'` 兼容、空页 fallback）

---

## [0.2.0] - 2026-05-01

### Changed
- **数据源迁移**：Tushare + cninfo → 东方财富免费 API
  - 股票池、行情、财报均切换到东方财富
  - `services/eastmoney.ts` 替换 `services/tushare.ts` + `services/cninfo.ts`
  - `ts_code` 字段保留兼容标识，新增 `secid` 转换函数

### Removed
- Tushare API 依赖（旧 `TUSHARE_TOKEN` 仍兼容）
- cninfo 爬取（旧 `CNINFO_COOKIE` 仍兼容）

---

## [0.1.5] - 2026-05-01

### Fixed
- HTML 响应增加 `Cache-Control: no-cache, no-store, must-revalidate` 头，防止旧 bundle 卡缓存
- 切换 Pages Functions → `_worker.js` 高级模式（functions/ 目录在 `wrangler pages deploy` 不会被上传）
- CI 用 `npm install -g wrangler` 直接调用 CLI，替代 `wrangler-action`（解决 pnpm monorepo 冲突）
- 移除 `NODE_OPTIONS=--no-experimental-fetch` 和 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`（Node 22+ 已无效）

### Improved
- `_worker.js` 代理：清理 hop-by-hop headers，正确转发 cookies / 鉴权头

---

## [0.1.4] - 2026-04-30

### Fixed
- `dist/` 目录构建后清理 macOS AppleDouble 文件（`._*`）
- `_redirects` 移除执行权限，Pages 才能正确读取
- CI Node 22 + pnpm 9.15.3 版本对齐
- corepack 加 `prepare --activate` 才会真正安装 pnpm

### Changed
- `packageManager` 字段升级到 `pnpm@9.15.3`，与 CI 版本一致

---

## [0.1.3] - 2026-04-30

### Added
- `apps/web/public/_redirects` 文件，支持 SPA 路由 fallback（避免刷新 404）

### Fixed
- 提交初始 Drizzle migration SQL，`deploy-api` 才能在远程 D1 建表
- 前端 `VITE_API_BASE` 拼接 `/api` 前缀，避免请求 `/auth/login` 而非 `/api/auth/login`

---

## [0.1.2] - 2026-04-30

### Fixed
- `wrangler.toml` 配置纠错（D1 / KV ID）
- CI 中 API URL 修正
- `.gitignore` 加 `**/._*` 规则，防止 macOS 隐藏文件污染 dist
- 忽略 legacy/ 下 Python `__pycache__`

---

## [0.1.0] - 2026-04-30

### Added
- 项目 v2 全栈重写（**第一个里程碑**）
  - 后端：Hono + Drizzle + Cloudflare Workers + D1 + KV
  - 前端：Vue 3 + Vite + Tailwind + shadcn-vue + Pinia + ECharts
  - 共享：`packages/shared` Zod schema
  - CI/CD：GitHub Actions 自动部署到 Cloudflare Pages / Workers
- 数据库 schema：users / stocks / stock_daily / financial_data / notes / favorites / valuation_cache
- 鉴权：JWT (HS256) + bcryptjs，access 15min / refresh 7d
- 业务模块：股票列表、详情、K 线、财报、估值、收藏、笔记、Admin
- 设计语言：极简金融风 + A 股红涨绿跌

### Removed
- v1 FastAPI + Vue 2 代码迁移到 `legacy/` 仅供查阅
- 老用户数据不迁移

---

## 历史版本说明

`0.1.0` 之前的版本（FastAPI + Vue 2 / SQLite / 自建部署）已归档到 `legacy/`，不再维护。

---

## 命名约定

- 主版本号 `X.0.0`：含 breaking change（API 不兼容）
- 次版本号 `0.Y.0`：新增功能，向后兼容
- 修订号 `0.0.Z`：bug fix / 文档 / 优化

PR 合并后维护流程：

```bash
# 在 Unreleased 追加一行
echo "- feat(api): xxx" >> CHANGELOG.md  # 手动编辑

# 发布时
sed -i '' 's/## \[Unreleased\]/## [Unreleased]\n\n## [0.2.2] - 2026-05-15/' CHANGELOG.md
git tag v0.2.2
git push --tags
```
