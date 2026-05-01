# 故障排查手册

> 最后更新：2026.05.01
> 已踩过的坑 + 现象 + 根因 + 修复。新踩的坑请追加到末尾。

---

## 1. 部署失败类

### 1.1 `ERR_PNPM_ADDING_TO_ROOT`（CI 部署 Web 时挂）

**现象**：

```
Run cloudflare/wrangler-action@v3
🔍 Checking for existing Wrangler installation
📥 Installing Wrangler
  /opt/.../bin/pnpm add wrangler@3.90.0
   ERR_PNPM_ADDING_TO_ROOT  Running this command will add the dependency to the workspace root
Error: 🚨 Action failed
```

**根因**：`cloudflare/wrangler-action@v3` 内部用 `pnpm add wrangler` 装 wrangler，但 monorepo 根目录被 pnpm 拒绝（必须加 `-w`）。

**修复**：放弃 `wrangler-action`，改用全局 npm 装 + 直接调 CLI：

```yaml
- name: Install wrangler
  run: npm install -g wrangler@3.114.17

- name: Deploy to Cloudflare Pages
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
  run: wrangler pages deploy apps/web/dist --project-name=yzinvest-ai --branch=...
```

`deploy-api.yml` 没踩这个坑，因为它一直用 `pnpm --filter @yzinvest/api exec wrangler` —— wrangler 在子 workspace 已是 devDependency。

---

### 1.2 D1 远程是空的，所有 API silently 挂

**现象**：

- `curl /api/auth/register` 没响应（看着像超时）
- 浏览器 register 显示 `Failed to fetch`
- `wrangler d1 execute yzinvest --remote --command "SELECT name FROM sqlite_master"` 输出空

**根因**：本地跑了 `pnpm db:generate` 但生成的 SQL 文件**没 commit**。CI 每次 checkout 拿到的 `drizzle/migrations/` 只有 `.gitkeep`，`wrangler d1 migrations apply` 没事可干。

**修复**：

```bash
git status apps/api/drizzle/migrations/
# 看到 .sql 文件未跟踪 → 加上
git add apps/api/drizzle/migrations/
git commit -m "fix(db): commit initial Drizzle migration"
git push
```

CI 再跑一次 `deploy-api.yml`，远程 D1 创建表，问题消失。

**预防**：加个 lint：commit 前如果 `pnpm db:generate` 生成了新 SQL，git 没 add 就警告。

---

### 1.3 GitHub Actions Node 24 兼容性

**现象**：CI 报错 `--no-experimental-fetch is an invalid negation`。

**根因**：`NODE_OPTIONS=--no-experimental-fetch` 和 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` 在 Node 22+ 已无效。

**修复**：移除所有 Node 24 强制配置，工作流直接 `actions/setup-node@v4` 指定 `node-version: 22`。

---

### 1.4 Pages Functions 未被识别

**现象**：`apps/web/functions/api/[[path]].ts` 写好了，部署后请求 `/api/health` 返回的是 SPA HTML 而不是代理结果。

**根因**：`wrangler pages deploy apps/web/dist` 只上传 `dist/` 内的文件，`functions/` 目录是 dist 的兄弟，不会一起上传。

**修复**（v2 实际选择）：用 `_worker.js` 高级模式：
- 把代理逻辑写进 `apps/web/public/_worker.js`
- 构建后自动进 `dist/_worker.js`
- 部署时 wrangler 识别为 Pages 高级模式 Worker

---

### 1.5 浏览器一直加载旧 bundle

**现象**：修复 `VITE_API_BASE` 后用户刷新页面，但 Network 里 `auth/login` 请求还是用旧的 URL（少 `/api`）。

**根因**：
1. Cloudflare CDN 缓存了旧 `index.html`
2. 浏览器/Service Worker 缓存了旧的 bundle JS
3. Vite hash 文件名只对 JS/CSS 有效；HTML 入口点必须强制不缓存

**修复**：`_worker.js` 给所有 `text/html` 响应加：

```js
"Cache-Control": "no-cache, no-store, must-revalidate",
"Pragma": "no-cache"
```

**应急绕过**：用户用**无痕窗口**访问 → 或浏览器 `Cmd+Shift+R` 强刷。

---

### 1.6 AppleDouble 文件污染 dist

**现象**：

- 部署后控制台报 `Failed to load module script: ._optimizer.css`（之类的）
- `git status` 看到一堆 `._foo.ts` 文件

**根因**：项目放在 macOS 网络共享盘（`/Volumes/work` 是 NFS / SMB），系统会创建 `._<filename>` AppleDouble 元数据文件。Vite 构建时连这些一起打进 dist。

**修复**：

```yaml
# .github/workflows/deploy-web.yml 加这一步：
- name: Clean AppleDouble files from dist
  run: find apps/web/dist -name '._*' -delete
```

`.gitignore` 也加上 `**/._*` 防止误 commit。

---

## 2. 鉴权与 API 类

### 2.1 注册显示 `Route not found`

**现象**：登录页提交后，前端显示 `Route not found`（404 from API）。

**根因**：前端构建时 `VITE_API_BASE` 没设或设错了，导致请求走到了不存在的路径。例：

- `VITE_API_BASE=https://...workers.dev`（缺 `/api`）→ 请求成 `https://...workers.dev/auth/login` → API Worker 路由是 `/api/auth/login` → 404

**修复**：

- 生产：`.github/workflows/deploy-web.yml` 设 `VITE_API_BASE: /api`，配合 `_worker.js` 同源代理
- 本地：默认 `/api`，vite proxy 转 :8787

> 别再把 `VITE_API_BASE` 设成 `workers.dev` 完整域名，国内访问 `*.workers.dev` 不稳。

---

### 2.2 登录后立刻被踢回 `/login`

**现象**：登录成功，跳到 `/`，但马上又跳回 `/login`。

**可能原因**：
1. `JWT_SECRET` 在 deploy 后换了，老 token 立刻失效
2. 后端 `/api/auth/me` 不存在或返回 401
3. 前端 `auth.init()` 失败但没正确清掉 token

**排查**：

```js
// 浏览器 console
localStorage.getItem("auth")
// 看 token 在不在；如果一直在但被踢，是后端 401 把它清了
```

```bash
# 用现有 token 调 me
curl -i https://yzinvest-ai.pages.dev/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
# 200 = 后端正常，前端 bug；401 = secret 变了或 token 过期
```

**修复**：清 localStorage → 重新登录。

---

### 2.3 财报永远 503 / 缓存 miss 后失败

**现象**：股票详情→财报 tab 永远报错。

**根因**：`CNINFO_COOKIE` 失效（cninfo 服务端 session 过期，约 1-2 周）。

**修复**：

```bash
# 浏览器开 https://www.cninfo.com.cn → 任意页面 → DevTools → Network
# → 找一个 XHR 请求 → Headers → Request Headers → 复制整段 Cookie

cd apps/api
pnpm exec wrangler secret put CNINFO_COOKIE
# 粘贴新 Cookie
```

**长期方案**：换更稳定的数据源（东方财富 datacenter API）。当前 `apps/api/src/services/eastmoney.ts` 已经有了基础设施，财报路由切到东财即可。

---

### 2.4 admin 接口返回 403

**现象**：调 `/api/admin/sync/stocks` 返回 `Admin access required`。

**根因**：当前用户 `role !== 'admin'`。

**修复**：直接改 D1：

```bash
pnpm --filter @yzinvest/api exec wrangler d1 execute yzinvest --remote \
  --command "UPDATE users SET role='admin' WHERE username='你的用户名'"
```

⚠️ 改完 role 后**当前 access_token 还是 user 角色**（JWT 是签名的，不会回查 DB）。需要：
- 重新登录拿新 token，或
- 等 access_token 过期（15 分钟）再 refresh

---

## 3. 数据同步类

### 3.1 同步股票池后表里 0 条

**现象**：调 `POST /api/admin/sync/stocks` 返回成功，但 `SELECT COUNT(*) FROM stocks` 还是 0。

**可能原因**：
1. 东方财富接口返回空（接口调整 / fs 参数变化）
2. 该 API 调用走的是单页 200 条，分页没翻完
3. 网络问题（Worker 调外网超时）

**排查**：

```bash
# 看 Worker 日志
pnpm --filter @yzinvest/api exec wrangler tail
# 然后再触发一次 sync，看 console.log 输出
```

**修复**：调 `/api/admin/sync/stocks/all` 触发分页同步。或检查 `fs` 参数是否还是有效（详见 [DATA_GUIDE.md](./DATA_GUIDE.md)）。

---

### 3.2 K 线接口返回空数组

**现象**：`/api/daily/000001.SZ?range=3M` 返回 `{"items":[],"count":0,"source":"empty"}`。

**根因**：本地 D1 里没有该股票的日线数据，且后端 fallback 拉东财失败（网络/参数）。

**修复**：

1. 先看 stocks 表里这个 ts_code 存不存在
2. 看 Worker 日志的 `EastMoney kline fetch failed:` 错误
3. 大概率是 `tsCodeToSecid` 映射错了，或 `period` 参数不对

---

## 4. 本地开发类

### 4.1 `pnpm install` 一直挂

**现象**：

```
Progress: resolved 401, reused 91, downloaded 178, added 268
（卡住几分钟没动）
```

**根因**：esbuild / workerd / 其它带 native binding 的包 postinstall 在网络共享盘上运行 `--version` 校验失败 / 无限挂起。

**修复**：

```bash
pkill -9 -f workerd
pkill -9 -f esbuild
pkill -9 -f pnpm
rm -rf node_modules apps/*/node_modules packages/*/node_modules

# 跳过 postinstall 脚本
pnpm install --ignore-scripts
```

---

### 4.2 `vite build` 在网络盘上挂死

**现象**：本地 `pnpm build` 跑很久不出结果。

**根因**：项目在 NFS/SMB 挂载（`/Volumes/work` 是 NAS）。Vite/esbuild 大量小文件读写性能极差。

**修复**：

- 把项目放本地 SSD 跑构建
- 或不要本地 build，直接 push 让 CI 在 Linux 容器跑（CI 永远是 SSD）

---

### 4.3 `wrangler dev` 报 8787 端口被占

```bash
lsof -i :8787
# 看到旧的 wrangler 进程
kill -9 <pid>
```

或换端口：`pnpm dev:api -- --port 8788`，前端 `vite.config.ts` 也改 proxy target。

---

## 5. 飞书 / 文档同步类

### 5.1 飞书文档 Mermaid 渲染失败（partial_success）

**现象**：用 `lark-cli docs +update --command overwrite` 写入文档，返回 `partial_success` + `Whiteboard content parse failed`。

**根因**：飞书白板的 Mermaid 解析对某些语法不支持，比如：
- 多 ID 用逗号在 `class` 指令中：`class A,B,C cf` ❌
- 在中文 dotted edge label：`X -.评论 PR.-> Y` ❌
- 闭括号在新行：`Prod([yzinvest-ai.pages.dev<br/>生产]\n)` ❌

**修复**：简化 Mermaid 语法，参考飞书白板支持子集，或用 `block_insert_after` 单独插。

---

## 6. 网络访问类

### 6.1 国内访问 `*.workers.dev` 时通时不通

**现象**：直接 curl `https://yzinvest-ai-api.coollinn.workers.dev/health` 超时。

**根因**：国内某些运营商对 `workers.dev` 不友好，DNS 污染或 TCP 阻断。

**修复**：客户端**永远不直接访问 workers.dev**。生产用 `_worker.js` 在 Pages 边缘代理，浏览器只访问 `pages.dev`。

> Cloudflare Pages 在国内有节点，比 workers.dev 稳很多。

---

## 7. 通用排查思路

遇到没列出的问题，按这个顺序：

1. **看现象在哪一层**：浏览器（前端）/ 网络（CDN/代理）/ 服务器（Worker）/ 数据库（D1）
2. **缩小范围**：能 curl 通吗？能用 wrangler 直查 D1 吗？
3. **看日志**：
   - GitHub Actions：repo → Actions → 该 workflow run
   - Worker 实时：`pnpm --filter @yzinvest/api exec wrangler tail`
   - Pages 部署：CF Dashboard → Pages → 项目 → Deployments
4. **用无痕窗口**：排除浏览器缓存
5. **回到上一个 commit**：如果 push 后立刻挂，`git revert` 或回滚 Pages deployment

---

## 附录：踩坑预防 checklist

- [ ] 改 schema 后**立刻** `pnpm db:generate` + `git add drizzle/migrations/`
- [ ] 改 secrets 时不要写进 wrangler.toml
- [ ] CORS_ORIGINS 修改后必须重新 deploy API
- [ ] 升级 wrangler / pnpm / Node 时同步改 `.github/workflows/` 和 `package.json` 的 `packageManager`
- [ ] 前端代码**永远不写 `https://...workers.dev`** 完整 URL
- [ ] AppleDouble 文件不要 commit（`.gitignore` 里有 `**/._*`）
- [ ] 重要部署后**主动通知用户强刷或用无痕窗口**
