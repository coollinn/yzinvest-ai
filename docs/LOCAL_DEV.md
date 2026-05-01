# 本地开发指南

> 最后更新：2026.05.01
> 第一次进项目跟着这份文档跑一遍。所有命令都在仓库根目录执行。

---

## 1. 工具链要求

| 工具 | 版本 | 安装方式 |
|------|------|----------|
| Node.js | ≥ 20（推荐 22）| 用 [nvm](https://github.com/nvm-sh/nvm)：`nvm install 22 && nvm use 22` |
| pnpm | 9.15.x（必须）| `corepack enable && corepack prepare pnpm@9.15.3 --activate` |
| git | 任意 | 系统自带 |
| Cloudflare 账号 | — | 仅"想跑生产部署/同步线上 D1"时才需要，本地开发不强制 |

> **不要用 npm/yarn 装本仓库依赖**。`packageManager: "pnpm@9.15.3"` 已声明在 `package.json`，混用会触发 monorepo workspace 协议错误。

---

## 2. 第一次安装

```bash
# 克隆
git clone git@github.com:coollinn/yzinvest-ai.git
cd yzinvest-ai

# 启用 pnpm（仅首次）
corepack enable

# 装依赖（会装根 + apps/api + apps/web + packages/shared）
pnpm install
```

期望看到：
- `node_modules/` 在 4 个位置出现（根 + 3 个子包）
- `pnpm-lock.yaml` 没有改动

---

## 3. 启动本地开发（双进程）

需要开**两个终端**：

### 终端 1：API（Hono on wrangler dev）

```bash
pnpm dev:api
# → wrangler dev 启动在 http://localhost:8787
```

首次启动 wrangler 会在 `.wrangler/state/v3/` 创建本地 D1 SQLite 文件。

### 终端 2：前端（Vite）

```bash
pnpm dev:web
# → vite 启动在 http://localhost:5173
```

Vite proxy（`apps/web/vite.config.ts`）会把 `/api/*` 转发到 `:8787`。

打开浏览器访问 <http://localhost:5173>，登录注册都通局部 API。

---

## 4. 本地数据库

### 4.1 应用 schema 到本地 D1

```bash
pnpm db:migrate:local
# wrangler d1 migrations apply yzinvest --local
```

看到 7 张表创建成功就 OK。

### 4.2 看本地 D1 数据

```bash
# 看所有表
pnpm --filter @yzinvest/api exec wrangler d1 execute yzinvest --local \
  --command "SELECT name FROM sqlite_master WHERE type='table'"

# 注册个本地用户后看
pnpm --filter @yzinvest/api exec wrangler d1 execute yzinvest --local \
  --command "SELECT id, username, role FROM users"
```

### 4.3 在本地清空某表

```bash
pnpm --filter @yzinvest/api exec wrangler d1 execute yzinvest --local \
  --command "DELETE FROM stocks"
```

### 4.4 完全重置本地 D1

```bash
rm -rf apps/api/.wrangler/state
# 重启 wrangler dev 会自动重建
pnpm dev:api
pnpm db:migrate:local
```

---

## 5. 本地 secret 配置（可选）

如果你要在本地调用 Tushare / 东方财富 / cninfo 等需要 secret 的接口：

```bash
cd apps/api
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，填入：
#   TUSHARE_TOKEN=...
#   JWT_SECRET=any-32-byte-hex      # openssl rand -hex 32
#   CNINFO_COOKIE=...
```

`.dev.vars` 已在 `.gitignore`，不会被 commit。

`wrangler dev` 启动时会自动加载这个文件。

---

## 6. 常用开发命令速查

```bash
# 类型检查
pnpm typecheck                       # 全部
pnpm --filter @yzinvest/web typecheck
pnpm --filter @yzinvest/api typecheck

# 构建（验证 prod 构建能不能通过）
pnpm build                           # 全部
pnpm build:web
pnpm build:api

# 改 schema 后
pnpm db:generate                     # 生成新 migration SQL
pnpm db:migrate:local                # 本地应用
# !!! 别忘了 git add apps/api/drizzle/migrations/ 然后 commit

# 看实时 API 日志（生产线）
pnpm --filter @yzinvest/api exec wrangler tail
```

---

## 7. 调试技巧

### 7.1 后端断点

`pnpm dev:api` 时 wrangler 暴露 `chrome://inspect` 的 Node 调试端口。可以打断点。

### 7.2 前端 Vue Devtools

Chrome / Firefox 装 [Vue.js devtools](https://devtools.vuejs.org/)，能看 Pinia state、router 路由、组件 props。

### 7.3 网络请求查 ofetch 日志

`apps/web/src/lib/api.ts` 的 `onRequest` / `onResponseError` 里加 `console.log` 即可。生产环境构建时记得删。

### 7.4 检查 vite 是否在用代理

打开 <http://localhost:5173>，DevTools → Network → 看 `/api/auth/me` 这种请求，Status 应该是 200，Server 应该指向 `Cloudflare-Workers` 或 `Hono`（说明走到了 :8787）。

### 7.5 wrangler 报 D1 not found

通常是 `apps/api/wrangler.toml` 的 `database_id` 写错了。本地开发其实不用真实 ID，`--local` 模式只用 `database_name` 字段。

---

## 8. 编辑器设置（推荐）

### 8.1 VS Code

推荐扩展：
- **Vue - Official**（旧名 Volar）— Vue 3 类型支持
- **ESLint**
- **Tailwind CSS IntelliSense**
- **Drizzle ORM** — schema 自动补全
- **DotENV** — 高亮 `.dev.vars`

`.vscode/settings.json`（建议加，但目前仓库未提交）：

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": false,
  "vue.server.maxOldSpaceSize": 8192
}
```

### 8.2 Cursor / WebStorm

类似配置，确保 TypeScript 用 workspace 版本而不是内置版本。

---

## 9. 本地开发常见错误

| 现象 | 解决 |
|------|------|
| `pnpm install` 装到一半挂 | 检查 Node 版本是否 ≥ 20；删 `node_modules/` 重装 |
| `wrangler dev` 报 port 8787 in use | 已经在跑 → `lsof -i :8787` 找到进程 kill；或 `pnpm dev:api -- --port 8788` |
| `vite dev` 报 vue-tsc 类型错误 | 改一下错误文件；type 错误不会阻塞 vite，但 build 会挂 |
| 登录后立刻被踢回 | localStorage 里的 token 已过期；自动会清，再注册一个 |
| Vite proxy 没生效 | 看 `vite.config.ts` 的 server.proxy 配置；确保前端用 `/api` 而不是绝对 URL |

更多见 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)。

---

## 10. 提交前自检清单

```bash
# 1. typecheck 通过
pnpm typecheck

# 2. build 通过（重要！本地不 build 就 push，CI 容易爆）
pnpm build

# 3. 改了 schema 必须把 migration 一起 commit
git status apps/api/drizzle/migrations/
# 看到 .sql 文件没？没 commit 就 git add

# 4. 不要 commit 任何 secret
git diff --staged | grep -iE "token|secret|password|key" | head
# 出现可疑内容立刻 unstage

# 5. push
git push
```

CI 会跑 typecheck + build + deploy；本地预先跑一遍能省回退时间。
