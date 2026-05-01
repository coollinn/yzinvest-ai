# 前端结构

> 最后更新：2026.05.01
> 页面、组件、设计系统、状态管理。

源码根目录：[`apps/web/src/`](../apps/web/src/)

---

## 1. 路由地图

源码：[`apps/web/src/router/index.ts`](../apps/web/src/router/index.ts)

| 路径 | name | 组件 | 鉴权 |
|------|------|------|------|
| `/` | home | `pages/Home.vue` | 公开（登录后内容更丰富）|
| `/stocks` | stocks | `pages/Stocks.vue` | 公开 |
| `/stocks/:tsCode` | stock-detail | `pages/StockDetail.vue` | 公开 |
| `/favorites` | favorites | `pages/Favorites.vue` | requiresAuth |
| `/notes` | notes | `pages/Notes.vue` | requiresAuth |
| `/settings` | settings | `pages/Settings.vue` | requiresAuth |
| `/admin` | admin | `pages/Admin.vue` | requiresAuth + requiresAdmin |
| `/login` | login | `pages/Login.vue` | 公开 |
| `/register` | register | `pages/Register.vue` | 公开 |
| `/:pathMatch(.*)*` | not-found | `pages/NotFound.vue` | 公开 |

`router.beforeEach` 守卫：未登录访问 requiresAuth 路由 → 跳到 `/login?redirect=...`；非 admin 访问 requiresAdmin → 跳回 `/`。

---

## 2. 布局：Sidebar + 主内容

`App.vue` 顶层：

```vue
<div class="flex h-screen overflow-hidden bg-background">
  <Sidebar v-if="showSidebar" class="shrink-0" />
  <main class="flex flex-1 flex-col overflow-hidden">
    <RouterView v-slot="{ Component }">
      <Transition name="fade" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>
</div>
```

侧边栏只在登录后显示，登录/注册页全屏无侧栏。

### 2.1 Sidebar 导航项

源码：[`apps/web/src/components/layout/Sidebar.vue`](../apps/web/src/components/layout/Sidebar.vue)

```ts
mainNav = [
  { icon: LayoutDashboard, label: "首页", to: "/" },
  { icon: TrendingUp,      label: "行情", to: "/stocks" },
  { icon: Star,            label: "自选", to: "/favorites" },
  { icon: BookOpen,        label: "笔记", to: "/notes" },
];

bottomNav = [
  { icon: Settings, label: "设置", to: "/settings" },
  { icon: Shield,   label: "管理", to: "/admin", adminOnly: true },
];
```

支持折叠（点 logo 切换）；包含主题切换 + 用户信息 + 登出按钮。

---

## 3. 页面详解

### 3.1 Home.vue（首页）

- 当前时间 + 用户问候
- 4 个快捷入口卡片（行情 / 搜索 / 自选 / 笔记）
- 自选股快览（最多 4 只，登录后才有）
- 统计：股票库总数 + 自选数（来自 `/api/stocks/stats`）

### 3.2 Stocks.vue（行情列表）

- 顶部搜索框（前端实时过滤当页数据）
- 表格列：代码 / 名称 / 行业 / 市场 / 上市日期
- 表头粘性定位（sticky top-0）
- 分页：上一页 / 下一页 + "第 X / Y 页"

API：`GET /api/stocks?page=1&limit=30`

### 3.3 StockDetail.vue（股票详情，主战场）

布局：左侧 K 线图 + 右侧三张信息卡（价格 / 成交 / 财务概览）。

```
┌──────────────────────────────────────┬──────────────────┐
│  Header: 名称 + 代码 + 标签 + 收藏 + 刷新                  │
├──────────────────────────────────────┼──────────────────┤
│                                      │ 当前价格 卡片     │
│            K 线图（ECharts）           ├──────────────────┤
│                                      │ 成交 卡片         │
│                                      ├──────────────────┤
│                                      │ 财务概览 卡片     │
├──────────────────────────────────────┴──────────────────┤
│ Tabs: K 线 | 财报 | 估值 | 笔记                            │
└──────────────────────────────────────────────────────────┘
```

四个 tab 子组件：
- `KLineChart.vue` — ECharts candlestick + dataZoom + 1M/3M/6M/1Y 切换
- `FinancialPanel.vue` — 4 张主报表 tab，长表透视成宽表展示
- `ValuationPanel.vue` — DCF + CAPM 表单，前端即时计算
- `NotesPanel.vue` — 当前股票的笔记编辑（每个 ts_code 一条）

### 3.4 Favorites.vue（自选夹）

卡片列表，每张含代码、名称、行业、删除按钮。点击卡片跳详情页。
未来要加拖拽排序（schema 已支持 `sort_order`）。

### 3.5 Notes.vue（我的笔记）

列出该用户所有笔记（不限 ts_code）。每条笔记是一张卡片，可点击跳到对应股票详情。

### 3.6 Settings / Admin / Login / Register / NotFound

- Settings：账户信息（只读）+ 主题切换（亮 / 暗 / 跟随系统）
- Admin：dashboard 统计卡 + 同步股票池按钮（role=admin 才进得来）
- Login / Register：极简表单，VeeValidate + Zod 校验
- NotFound：404 页

---

## 4. 状态管理（Pinia）

### 4.1 `useAuthStore` ([`stores/auth.ts`](../apps/web/src/stores/auth.ts))

```ts
{
  user:           User | null
  accessToken:    string | null     // persisted
  refreshToken:   string | null     // persisted
  isAuthenticated: computed
  isAdmin:        computed

  init():        Promise<void>      // 启动时调用，拉 /me
  fetchMe():     Promise<void>
  register(input)
  login(input)
  logout()
}
```

- 持久化：`pinia-plugin-persistedstate` 把 access/refresh token 写到 localStorage
- 启动时 `App.vue` 的 `onMounted` 会调 `auth.init()`，token 失效自动清掉
- token 注入：`stores/auth.ts` 调用 `setTokenProvider(() => accessToken.value)`，让 `lib/api.ts` 自动加 `Authorization` 头

### 4.2 `useThemeStore` ([`stores/theme.ts`](../apps/web/src/stores/theme.ts))

```ts
{
  mode:      'light' | 'dark' | 'system'   // persisted
  effective: computed → 'light' | 'dark'
  set(m)
  toggle()
}
```

`watchEffect` 监听 effective，自动给 `<html>` 加/去 `dark` class。

---

## 5. API 客户端

源码：[`apps/web/src/lib/api.ts`](../apps/web/src/lib/api.ts)

```ts
const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export const api = ofetch.create({
  baseURL: API_BASE,
  retry: 0,
  onRequest({ options }) {
    const token = getAccessToken?.();
    if (token) {
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${token}`);
      options.headers = headers;
    }
  },
  async onResponseError({ response }) {
    if (response.status === 401) onUnauthorized?.();
    throw new ApiException(response.status, ...);
  },
});

export const apiGet, apiPost, apiPut, apiDelete    // 拆掉 { ok, data } 包装
```

> **VITE_API_BASE 怎么定**：
> - 本地开发：默认 `/api`（vite proxy 转 localhost:8787）
> - 生产部署：`/api`（同源走 _worker.js 代理到 workers.dev）
>
> **永远不要把 `https://...workers.dev` 直接配进 VITE_API_BASE**，国内访问 workers.dev 不稳定。

---

## 6. 设计系统

### 6.1 颜色（CSS Variables）

源码：[`apps/web/src/styles/globals.css`](../apps/web/src/styles/globals.css)

```css
:root {
  --bg:        0 0% 100%;
  --surface:   0 0% 98%;
  --border:    0 0% 90%;
  --fg:        0 0% 4%;
  --fg-muted:  0 0% 45%;

  --primary:   0 0% 4%;
  --accent:    217 91% 60%;     /* #2563eb 焦点蓝 */

  /* A 股惯例：红涨绿跌 */
  --up:    0 73% 50%;          /* #DC2626 */
  --down:  142 71% 45%;        /* #16A34A */
  --warning: 24 95% 53%;

  --radius: 0.5rem;
}
.dark { /* 同上深色变体 */ }
```

### 6.2 涨跌色用法

```html
<!-- 用 Tailwind 类，不要写死 hex -->
<span class="text-up">+5.23%</span>
<span class="text-down">-1.81%</span>

<!-- 工具函数：自动按数值正负返回 class -->
<span :class="colorByChange(value)">{{ value }}</span>
```

`colorByChange` 在 [`apps/web/src/lib/utils.ts`](../apps/web/src/lib/utils.ts)。

### 6.3 字体

```css
font-family: -apple-system, BlinkMacSystemFont,
             "PingFang SC", "HarmonyOS Sans SC",
             Inter, system-ui, sans-serif;

font-mono:   "JetBrains Mono", ui-monospace, SFMono-Regular,
             Menlo, monospace;
```

数字用 `font-mono` + `tabular-nums`，对齐看着舒服。

### 6.4 间距

8 的倍数 / Tailwind 默认 spacing scale：`p-1 (4px) p-2 (8px) p-3 (12px) p-4 (16px) ...`。

---

## 7. UI 组件库（shadcn-vue 风格）

[`apps/web/src/components/ui/`](../apps/web/src/components/ui/) 下复制的源码组件，可深度定制。

| 组件 | 作用 |
|------|------|
| `Button.vue` | 6 种 variant（default/destructive/outline/secondary/ghost/link） + 4 种 size + loading 状态 |
| `Card.vue` + `CardHeader/Title/Description/Content/Footer` | 标准卡片 |
| `Input.vue` | text / number / email / password / tel / url / search |
| `Label.vue` | 表单标签 |
| `Badge.vue` | 6 种 variant，含涨跌色 `up` / `down` |
| `Skeleton.vue` | 骨架屏占位 |
| `Separator.vue` | 分隔线 |

---

## 8. 业务组件（stock/）

[`apps/web/src/components/stock/`](../apps/web/src/components/stock/)

| 组件 | 用途 |
|------|------|
| `KLineChart.vue` | ECharts candlestick + 成交量副图 + dataZoom |
| `FinancialPanel.vue` | 4 张主报表展示，长表透视回宽表 |
| `ValuationPanel.vue` | DCF + CAPM 表单 + 即时计算 |
| `NotesPanel.vue` | 当前股票笔记编辑（标签 / 评分 / 类型）|

---

## 9. 工具函数（lib/）

[`apps/web/src/lib/`](../apps/web/src/lib/)

```ts
// utils.ts
cn(...classes)              // clsx + tailwind-merge
formatNumber(v, options)    // 默认 2 位小数，千分位
formatCurrency(v)           // 1234567 → "123.46 万"，1234567890 → "12.35 亿"
formatVolume(v)             // 同上
formatPercent(v, withSign, fromDecimal)
colorByChange(v)            // 红涨绿跌 → text-up / text-down / text-muted-foreground
formatDate(YYYYMMDD)        // → "YYYY-MM-DD"

// finance.ts
calculateDCF(input)         // 5 年预测 + 终值
calculateCAPM(input)
```

---

## 10. 性能与 UX 注意

- **路由懒加载**：所有页面都用 `() => import(...)`，按需加载
- **TanStack Query 缓存**：默认 staleTime=30s，不会一秒内重复请求
- **暗色模式无闪烁**：`watchEffect` 在 main.ts 启动后立刻应用 class
- **K 线图**：`vue-echarts` 的 `autoresize` 自动跟容器尺寸
- **SPA fallback**：所有 404 通过 `_worker.js` 回到 `index.html`
- **HTML no-cache**：`_worker.js` 给 HTML 响应加了 `Cache-Control: no-store`，避免老 bundle 顽固缓存

---

## 11. 与 v1（Ant Design Vue）差异

| 维度 | v1 | v2 |
|------|-----|-----|
| UI 库 | Ant Design Vue 4 | shadcn-vue（Reka UI 内核） |
| 样式方案 | antd 默认主题 + 局部 scoped CSS | Tailwind + CSS Variables 全局 |
| 数据请求 | axios + Pinia 自己写缓存 | TanStack Query 自动缓存/重试 |
| 表单 | a-form 自带校验 | VeeValidate + Zod（与后端共用 schema）|
| 暗色模式 | 没接入 | useDark + CSS variables 全套 |
| 路由 | 引用了不存在的视图（运行时崩） | 全部齐 |
| 估值组件 | 单页几个表单 + a-card | StockDetail 内部独立 panel + tab |
