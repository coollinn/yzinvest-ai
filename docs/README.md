# YZInvest AI 项目文档

> 最后更新：2026.05.01
> 智能 A 股分析平台 v2 · Cloudflare 全栈
> 在线地址：<https://yzinvest-ai.pages.dev/>

---

## 文档地图

| 分类 | 文档 | 用途 |
|------|------|------|
| **架构** | [ARCHITECTURE.md](./ARCHITECTURE.md) | 整体架构、技术栈、数据流图 |
| **API** | [API.md](./API.md) | 后端所有 REST 端点参考 |
| **数据** | [DATA_GUIDE.md](./DATA_GUIDE.md) | 东方财富数据源接入策略、参数发现 |
| **数据同步** | [DATA_SYNC_MANUAL.md](./DATA_SYNC_MANUAL.md) | 数据同步操作手册（Layer 1/2 流程）|
| **数据库** | [DATABASE.md](./DATABASE.md) | Drizzle schema 详解 + migration 工作流 |
| **前端** | [FRONTEND.md](./FRONTEND.md) | 页面结构、路由、组件、设计系统 |
| **开发** | [LOCAL_DEV.md](./LOCAL_DEV.md) | 本地开发环境、调试、常用命令 |
| **协作规范** | [CONTRIBUTING.md](./CONTRIBUTING.md) | 分支策略、commit 规范、PR 流程、代码风格 |
| **术语表** | [GLOSSARY.md](./GLOSSARY.md) | 项目特有 / 易混术语、字段、缩写 |
| **运维** | [OPS_RUNBOOK.md](./OPS_RUNBOOK.md) | 监控、回滚、备份、事故处理 |
| **测试** | [TESTING.md](./TESTING.md) | 单测 / 集成 / E2E 策略与工具栈 |
| **性能** | [PERFORMANCE.md](./PERFORMANCE.md) | 前后端性能目标、瓶颈分析、优化手段 |
| **安全** | [SECURITY.md](./SECURITY.md) | JWT 鉴权、Secrets 管理、CORS |
| **故障排查** | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | 已知问题与解决方案 |
| **变更记录** | [CHANGELOG.md](./CHANGELOG.md) | 版本变更日志（按时间倒序）|
| **路线图** | [DEVELOPMENT_PLAN_v3.md](./DEVELOPMENT_PLAN_v3.md) | v3 开发计划与进度 |

> 部署相关：[../DEPLOYMENT.md](../DEPLOYMENT.md)（项目根目录）
> 仓库使用约定：[../CLAUDE.md](../CLAUDE.md)

---

## 脚本地图

| 分类 | 脚本 | 用途 | 最后更新 |
|------|------|------|----------|
| **数据同步** | [sync_all.sh](../scripts/sync_all.sh) | 一键全量同步（fetch + 本地 + 远程） | 2026.05.01 |
| **数据同步** | [sync_incremental.sh](../scripts/sync_incremental.sh) | 增量同步（智能检测差异） | 2026.05.01 |
| **数据同步** | [sync_resume.sh](../scripts/sync_resume.sh) | 断点续传（上次中断补漏） | 2026.05.01 |
| **数据获取** | [fetch_all_stocks.py](../scripts/fetch_all_stocks.py) | 东方财富全量数据获取（支持 JSON 备份） | 2026.05.01 |
| **项目管理** | [manage.sh](../scripts/manage.sh) | 项目管理入口（start/stop/test/deploy/同步） | 2026.05.01 |
| **数据库操作** | [batch_import_remote.sh](../scripts/batch_import_remote.sh) | 批量导入 SQL 到远程 D1 | 2026.05.01 |
| **历史脚本** | [sync_stocks_full.py](../scripts/sync_stocks_full.py) | 分板块全量同步（旧版） | 2026.05.01 |
| **历史脚本** | [sync_stocks_sql.py](../scripts/sync_stocks_sql.py) | SQL 生成脚本（旧版） | 2026.05.01 |
| **工具脚本** | [test_fS_params.py](../scripts/test_fS_params.py) | 测试东方财富各板块 API 参数 | 2026.05.01 |

### 脚本使用场景

| 场景 | 推荐脚本 | 命令 |
|------|----------|------|
| 首次部署 / 全量重刷 | `sync_all.sh` | `./scripts/sync_all.sh` |
| 每日增量维护 | `sync_incremental.sh` | `./scripts/sync_incremental.sh` |
| 上次中断后补漏 | `sync_resume.sh` | `./scripts/sync_resume.sh` |
| 服务启停管理 | `manage.sh` | `./scripts/manage.sh start/stop/restart` |
| 数据库状态检查 | `manage.sh` | `./scripts/manage.sh db-status` |
| 测试 API 接口 | `manage.sh` | `./scripts/manage.sh test` |
| 触发 CI/CD 部署 | `manage.sh` | `./scripts/manage.sh deploy` |

---

## 角色 → 该读哪些

| 角色 | 优先阅读 |
|------|----------|
| **第一次进项目** | README → ARCHITECTURE → LOCAL_DEV → GLOSSARY |
| **写后端** | ARCHITECTURE → API → DATABASE → DATA_GUIDE → TESTING |
| **写前端** | ARCHITECTURE → FRONTEND → API → PERFORMANCE |
| **要提 PR** | CONTRIBUTING → CHANGELOG |
| **运维 / 部署** | ../DEPLOYMENT → OPS_RUNBOOK → SECURITY → TROUBLESHOOTING |
| **遇到 bug** | TROUBLESHOOTING → OPS_RUNBOOK → CLAUDE.md 踩坑节 |
| **想优化性能** | PERFORMANCE → ARCHITECTURE |
| **要写测试** | TESTING → API |

---

## 项目速览

```
yzinvest-ai/
├── apps/
│   ├── web/           Vue 3 + Vite + Tailwind + shadcn-vue
│   │   └── public/_worker.js   Pages 高级模式：/api/* 代理到 Worker
│   └── api/           Hono + Drizzle + D1 + KV (Cloudflare Workers)
├── packages/
│   └── shared/        前后端共用 Zod schema + TS 类型
├── docs/              ← 你在这里
├── legacy/            旧版 FastAPI + Vue 2 代码（仅供查阅）
└── .github/workflows/ CI/CD
```

技术栈一句话：**Cloudflare Pages + Workers + D1 + KV + Cron Triggers**，全免费，全自动部署。

数据源：**东方财富免费 API**（push2 / push2his / datacenter）。

---

## 文档维护规则

1. **代码变了，文档要跟着变**。改 API、加路由、改 schema 都同步更新对应 .md
2. **本目录是 single source of truth**。同一个事实不要在多个文档重复，互相链接即可
3. **Markdown 严格用相对路径**，避免迁移目录后链接失效
4. **重大变更顺手同步飞书**。yzinvest-ai 飞书文件夹：`QH6vfK3xalxbNndxUuJc04Uinmg`
5. **时间格式统一用 `YYYY.MM.DD`**（如 `2026.05.01`）。每份文档头部第一行引用块写 `> 最后更新：YYYY.MM.DD`，每次实质性修改后必须同步更新这个日期
