# 协作规范

> 最后更新：2026.05.01
> 多人协作时的代码规范、提交约定、PR 流程。一个人写也可以照着走，养成肌肉记忆。

---

## 1. Branch 策略

```
main          ← 受保护分支，只接受 PR 合并；push 即触发生产部署
  ↑
  │  PR + review
  │
feat/*        ← 新功能分支
fix/*         ← 修 bug 分支
chore/*       ← 杂项（依赖升级、文档调整、CI 调整等）
refactor/*    ← 不改行为的重构
docs/*        ← 仅文档变更
```

**禁止**：

- ❌ 直接 push 到 `main`（除非紧急回滚 + 事后写 postmortem）
- ❌ 在 PR 里夹带与标题无关的改动
- ❌ 长期保留无人维护的 feature 分支（>2 周未合并应该 rebase 或关掉）

---

## 2. Commit message 规范（Conventional Commits 风格）

```
<type>(<scope>): <subject>

<body 可选>
```

### 2.1 type（必选）

| type | 用途 | 触发 CI 部署？ |
|------|------|----------------|
| `feat` | 新功能 | 是 |
| `fix` | bug 修复 | 是 |
| `chore` | 依赖、配置、构建 | 看 paths |
| `docs` | 仅文档 | 否（除非改了 README）|
| `refactor` | 重构（行为不变）| 是 |
| `perf` | 性能优化 | 是 |
| `test` | 测试相关 | 否 |
| `style` | 代码格式（空白、分号等）| 否 |
| `ci` | CI/CD 配置 | 自身 path 命中时是 |

### 2.2 scope（建议）

```
api / web / shared / db / ci / deps / docs / infra
```

例如：

```
feat(api): add /api/stocks/stats endpoint
fix(web): redirect to /login when 401 instead of crashing
chore(deps): bump wrangler 3.99 → 3.114
docs(api): document /api/admin/sync/stocks/all query params
ci(deploy-web): add AppleDouble cleanup before deploy
```

### 2.3 subject（必选）

- 50 字内
- 现在时祈使句（"add" 不要 "added"）
- 首字母小写
- 末尾不加句号
- 中文也可，保持简洁即可

### 2.4 body（可选但推荐）

> 解释 **为什么** 改，而不是 **改了什么**（diff 已经告诉你改了什么）。

例：

```
fix(ci): append /api to VITE_API_BASE so frontend hits backend correctly

Without the /api suffix, requests like apiGet('/stocks') resolved to
https://...workers.dev/stocks instead of /api/stocks, causing all
frontend data fetches to 404.
```

### 2.5 Co-author（与 AI 协作时）

```
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## 3. PR 流程

### 3.1 提交前自检

```bash
# 1. 类型检查通过
pnpm typecheck

# 2. 构建通过
pnpm build

# 3. 改了 schema 别忘了 commit migration
git status apps/api/drizzle/migrations/

# 4. 没漏 secret
git diff --staged | grep -iE "token|secret|password|key" | head
```

### 3.2 PR 模板

提交 PR 时建议在描述里包含：

```markdown
## What
（一句话总结）

## Why
（动机：解决什么问题）

## How
（实现方法的关键点）

## Test
- [ ] typecheck 通过
- [ ] 本地测过 main flow
- [ ] CI 全绿
- [ ] （如改 schema）migrations 已 commit
- [ ] （如改 API）API.md 已更新
- [ ] （如改前端）UI 截图

## Risks
（潜在影响 / 回滚方案）
```

### 3.3 Review 重点

reviewer 至少要看：

1. **改动范围**：是不是 PR 标题描述的事情？有没有夹带？
2. **测试是否覆盖**：新逻辑有测试吗？没测试有 manual test 步骤吗？
3. **接口稳定性**：改了 API 响应结构？前端是否同步？
4. **secret / 数据库**：有没有泄露 secret？schema 改动是否兼容？
5. **文档同步**：API.md / DATABASE.md / CHANGELOG.md 是否跟着改？

### 3.4 Merge 策略

- **小 PR（< 5 文件 / < 100 行）**：squash merge，简单
- **大 PR**：保留 commit 历史（rebase merge），便于回滚单个 commit
- **不要 use the GitHub merge commit**（除非有明确理由）

---

## 4. 代码风格

### 4.1 TypeScript

- **严格模式**：`tsconfig.base.json` 已开 `strict: true`，不要在子配置里关掉
- **禁用 `any`**：除非你能证明此处没有更好选择
- **优先 type / interface**：不要用 `enum`（除非真有数值表达需求），用 `as const` + `union`
- **导入排序**：约定 `external → @yzinvest/* → @/*` 三段，每段内字母序
- **路径别名**：前端用 `@/...`，跨 workspace 用 `@yzinvest/shared`

### 4.2 Vue

- `<script setup lang="ts">` 必选，不要用 Options API
- 组件 props 用 `defineProps<T>()`，emits 用 `defineEmits<T>()`
- 组件文件名 PascalCase，如 `StockDetail.vue`
- Composable 文件名 `useXxx.ts`，全都放 `apps/web/src/lib/`
- 不要在 template 里写复杂 JS 表达式，逻辑放 `<script>`

### 4.3 SQL / Drizzle

- 不要拼接 SQL 字符串，用 Drizzle query builder
- 复合主键 / 唯一约束放在 schema 文件里声明，别在迁移 SQL 里手写
- 时间字段全用 ISO 8601 字符串（`text` 列），不要 `Date` 对象

### 4.4 命名

| 场景 | 约定 |
|------|------|
| 文件（TS）| kebab-case：`sync-stocks.ts` |
| 文件（Vue）| PascalCase：`StockDetail.vue` |
| 函数 | camelCase：`fetchStockList` |
| 类型 / 接口 | PascalCase：`StockDetailResponse` |
| 常量 | UPPER_SNAKE_CASE：`API_BASE` |
| Tailwind class | 按 [Tailwind 顺序](https://tailwindcss.com/docs/editor-setup#automatic-class-sorting) |
| ts_code | 全小写带点：`000001.SZ` |
| 组件 props | camelCase 在 JS，kebab-case 在 template：`<KLineChart :ts-code="..." />` |

---

## 5. 文档同步责任

> 你改了代码，文档也要同步改。

| 改动 | 必须同步的文档 |
|------|----------------|
| 加 / 改 / 删 API 端点 | `docs/API.md` |
| 改 schema | `docs/DATABASE.md` |
| 加新页面 / 路由 | `docs/FRONTEND.md` |
| 改 CI/CD | `docs/TROUBLESHOOTING.md`（如踩了坑）+ 飞书 CI/CD 文档 |
| 加 secret | `docs/SECURITY.md` |
| 改部署流程 | `../DEPLOYMENT.md` |
| 引入新踩坑 | `docs/TROUBLESHOOTING.md` 或 `CLAUDE.md` 的 "CI/CD 避坑指南" |
| 任何文档改动 | 顶部 `> 最后更新：YYYY.MM.DD` 同步刷新 |

CHANGELOG.md 单独维护：每次合并 PR 后给当前未发布的 `Unreleased` 节加一行。

---

## 6. 依赖管理

### 6.1 升级

```bash
# 看哪些过时
pnpm outdated -r

# 加新依赖（自动到对应 workspace）
pnpm --filter @yzinvest/web add <pkg>
pnpm --filter @yzinvest/api add -D <pkg>

# 升级单个
pnpm --filter @yzinvest/web update <pkg>
```

### 6.2 升级原则

- **patch 版本（x.y.Z）**：随便升，CI 通过即可
- **minor 版本（x.Y.0）**：看 changelog；UI 库 minor 经常改样式
- **major 版本（X.0.0）**：单独 PR，标题写明 breaking changes
- **`packageManager` / `engines.node`**：升级要同步改 `.github/workflows/`，避免本地 vs CI 不一致

### 6.3 安全更新

`pnpm audit` 出现 high / critical → 立刻处理。其它低风险按月清理。

---

## 7. 紧急情况

### 7.1 生产挂了

1. **先回滚**：Cloudflare Dashboard → Pages / Workers → Deployments → 选上一个 deployment → Rollback
2. **查日志**：`pnpm --filter @yzinvest/api exec wrangler tail`
3. **写 postmortem**：在 `docs/TROUBLESHOOTING.md` 加新坑

### 7.2 生产数据写脏

```bash
# D1 没有 point-in-time recovery，但有 export
pnpm --filter @yzinvest/api exec wrangler d1 export yzinvest --remote --output backup.sql
# 出问题前定期跑这个，至少有个备份
```

### 7.3 凭证泄漏

```bash
# 立刻轮换 secret
pnpm --filter @yzinvest/api exec wrangler secret put JWT_SECRET
pnpm --filter @yzinvest/api exec wrangler secret put TUSHARE_TOKEN

# 已签发的 access_token 在 15 分钟内失效（refresh_token 7 天）
# 紧急要清掉所有人的 session：换 JWT_SECRET 即可，所有 token 立刻 invalid
```

---

## 8. 与 AI 协作（Claude Code）

- 让 AI 写代码前先用 `EnterPlanMode` 出方案
- 大改动让 AI 用 plan mode + 自检列表（typecheck / build / migration commit）
- AI 提交的 commit 必须含 `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
- AI 改完一定 review：看 `git diff` 而不是只看它的总结
