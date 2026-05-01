# 术语表

> 最后更新：2026.05.01
> 本项目特有的或容易搞混的术语 / 缩写 / 字段。看代码或文档时遇到不懂的来这里查。

---

## 一、金融术语

### A 股 / 沪深 / 北交所

中国大陆境内上市的人民币普通股。

- **沪市（SH）**：上海证券交易所，代码 `6` 开头
- **深市（SZ）**：深圳证券交易所，代码 `0` / `3` 开头
- **北交所（BJ）**：北京证券交易所，代码 `4` / `8` / `9` 开头

### 板块

| 板块 | 描述 | 代码段 |
|------|------|--------|
| 主板 | 大型成熟企业 | 沪 600/601/603/605；深 000 |
| 创业板 | 创新创业型 | 深 300 |
| 科创板 | 科技创新型 | 沪 688 |
| 北交所 | 中小企业 | 北 8/9 |

### ts_code

本项目业务主键格式 `<symbol>.<exchange>`。如 `000001.SZ`、`600519.SH`。

注：来自 Tushare 的命名约定（"ts" = Tushare），现在数据源已切到东方财富，但 ts_code 字段仍保留作为兼容标识。

### secid

东方财富 API 自己用的 ID 格式 `<market>.<symbol>`。

- `1.600519` = 上交所贵州茅台
- `0.000001` = 深交所平安银行

转换函数在 `apps/api/src/services/eastmoney.ts:tsCodeToSecid()`。

### 涨跌色（A 股惯例）

| 颜色 | 含义 | CSS variable | hex |
|------|------|--------------|-----|
| 红 | 涨 / 上涨 / 正数 | `--up` | `#DC2626` |
| 绿 | 跌 / 下跌 / 负数 | `--down` | `#16A34A` |

> 与欧美股市相反（欧美红跌绿涨）。

### pct_chg

涨跌幅，**百分点数值**（不是小数）。

- `1.28` = 涨 1.28%
- `-2.5` = 跌 2.5%

⚠️ 注意：千万别再 `* 100`，否则就成 128% 了。

### change

涨跌额（绝对值），单位 RMB。

```
change = close − pre_close
pct_chg = change / pre_close × 100
```

### vol / amount

| 字段 | 含义 | 单位 |
|------|------|------|
| `vol` | 成交量 | **手**（1 手 = 100 股 A 股）|
| `amount` | 成交额 | **元**（不是千元）|

### DCF（Discounted Cash Flow）

现金流折现模型。把未来 N 年的自由现金流 + 终值，按折现率折回今天，得到内在价值。

**公式**（5 年模型）：

```
PV = Σ FCF_i / (1+r)^i  for i=1..5
TV = FCF_6 / (r - g_terminal)         （永续年金）
TV_PV = TV / (1+r)^5
intrinsic_value = PV + TV_PV
```

参数：
- `freeCashFlow` — 自由现金流（万元）
- `growthRate` — 预测期增长率 (%)
- `discountRate` — 折现率 / WACC (%)
- `terminalGrowth` — 永续增长率 (%)，应 < 长期 GDP 增速

实现：`apps/web/src/lib/finance.ts:calculateDCF()`

### CAPM（Capital Asset Pricing Model）

资本资产定价模型，估计股票预期回报。

```
E(r) = r_f + β × (E(r_m) − r_f)
```

- `r_f` 无风险利率（10 年国债）
- `r_m` 市场预期回报
- `β` 贝塔系数，衡量股票相对市场的波动

实现：`apps/web/src/lib/finance.ts:calculateCAPM()`

### 安全边际 (Margin of Safety)

```
margin = (intrinsic_value − market_cap) / market_cap
```

正值越大越被低估。本项目当前用 `freeCashFlow * 10` 当 market_cap 占位（待改成真实市值）。

### 财务报表 4 张

| 中文 | 英文 | API key |
|------|------|---------|
| 资产负债表 | balance sheet | `balance_sheet` |
| 利润表 | income statement | `income_statement` |
| 现金流量表 | cash flow statement | `cash_flow` |
| 主要财务指标 | main indicators | `main_indicators` |

### report_type

财报期类型：

| 值 | 含义 | 报告月 |
|----|------|--------|
| `year` | 年报 | 12-31 |
| `middle` | 半年报 / 中报 | 06-30 |
| `one` | 一季报 | 03-31 |
| `three` | 三季报 | 09-30 |

### PE / PB / PS / ROE

| 缩写 | 全称 | 含义 |
|------|------|------|
| PE (TTM) | Price / Earnings, Trailing Twelve Months | 市盈率（滚动 12 月）|
| PB | Price / Book | 市净率 |
| PS (TTM) | Price / Sales, TTM | 市销率 |
| ROE | Return on Equity | 净资产收益率 |

字段在 `Stock` 类型上：`pe_ttm`、`pb`、`ps_ttm`、`roe`、`market_cap`。

---

## 二、技术术语 / 缩写

### Cloudflare 系列

| 名词 | 含义 |
|------|------|
| **Workers** | 边缘 serverless 函数运行时（V8 Isolate）|
| **Pages** | 静态网站托管 + 边缘 Function |
| **D1** | SQLite 兼容的边缘 SQL 数据库 |
| **KV** | Key-Value 存储，最终一致性 |
| **Cron Triggers** | 定时触发 Worker（用 cron 表达式）|
| **wrangler** | Cloudflare 官方 CLI |
| **`_worker.js`** | Pages 高级模式入口 Worker（在 dist/ 里）|
| **`_redirects`** | Pages SPA fallback 规则文件 |
| **wrangler.toml** | Worker 项目配置（绑定、cron、vars）|

### 框架 / 库

| 名词 | 描述 |
|------|------|
| **Hono** | 轻量 Web 框架，Workers 优先 |
| **Drizzle** | TypeScript ORM，SQL-first |
| **Zod** | Schema 校验库（前后端共用） |
| **TanStack Query** | 数据请求缓存 / 去重 / 重试 |
| **ofetch** | 现代 fetch wrapper，支持 baseURL / hooks |
| **Pinia** | Vue 状态管理 |
| **shadcn-vue** | 复制源码进仓库的组件库（Reka UI 内核）|
| **Reka UI** | shadcn-vue 的底层无样式 UI primitive |
| **lucide** | 图标集（默认导入用 `lucide-vue-next`）|
| **VeeValidate** | Vue 表单校验 |
| **ECharts** | 图表库 |
| **vue-echarts** | ECharts 的 Vue 包装器 |
| **klinecharts-pro** | 专业 K 线库（计划接入）|

### 项目内常用变量

| 变量 | 含义 |
|------|------|
| `VITE_API_BASE` | 前端 API 路径前缀，本地默认 `/api` |
| `JWT_SECRET` | 签 JWT 用，32 字节 hex |
| `TUSHARE_TOKEN` | Tushare API token（旧数据源，已弃用）|
| `CNINFO_COOKIE` | cninfo.com.cn 抓财报用（旧）|
| `CORS_ORIGINS` | API 允许的前端域名白名单 |
| `CLOUDFLARE_API_TOKEN` | CI 部署用（GitHub Secret）|
| `CLOUDFLARE_ACCOUNT_ID` | CF 账号 ID（GitHub Secret）|

### CI/CD

| 名词 | 描述 |
|------|------|
| **CI** | Continuous Integration，持续集成（自动 build + test）|
| **CD** | Continuous Delivery / Deployment，持续交付 / 部署 |
| **runner** | GitHub Actions 执行环境（默认 Ubuntu 22）|
| **workflow** | `.github/workflows/*.yml` 文件 |
| **path filter** | `on.push.paths` 字段，决定哪些文件改动触发 |
| **concurrency group** | 同时只允许一个跑，新跑取消旧跑 |
| **PR preview** | PR 时部署的预览环境，独立子域名 |

### 数据库相关

| 名词 | 描述 |
|------|------|
| **migration** | schema 演化的 SQL 文件，drizzle-kit 自动生成 |
| **upsert** | INSERT ON CONFLICT UPDATE，存在则更新 |
| **cascade delete** | 父记录删除时子记录跟着删 |
| **复合主键** | 多列联合主键，如 `(ts_code, trade_date)` |
| **长表 / 宽表** | 长表：每行一个字段值；宽表：每行多列；本项目 `financial_data` 是长表 |

### 鉴权

| 名词 | 描述 |
|------|------|
| **JWT** | JSON Web Token，无状态身份凭证 |
| **HS256** | HMAC-SHA256，对称密钥签名算法 |
| **access_token** | 短期凭证（15 分钟），每次请求带 |
| **refresh_token** | 长期凭证（7 天），换新 access_token |
| **Bearer token** | HTTP `Authorization: Bearer <token>` 模式 |
| **bcrypt** | 密码哈希算法；本项目用 cost=10 |

---

## 三、容易搞混的成对概念

| 概念 A | 概念 B | 区别 |
|--------|--------|------|
| `ts_code` | `secid` | 业务主键 vs 东财内部 ID；用 `tsCodeToSecid()` 互转 |
| `vol` | `amount` | 成交量（手）vs 成交额（元）|
| `change` | `pct_chg` | 涨跌额（元）vs 涨跌幅（%）|
| `Continuous Delivery` | `Continuous Deployment` | 自动打包但人审批发布 vs 完全自动发布 |
| `Pages` | `Workers` | 静态托管 vs 函数运行时；都在 Cloudflare 边缘 |
| `D1` | `KV` | SQL 关系型 vs Key-Value 缓存 |
| `migrate:local` | `migrate:remote` | 本地 SQLite 文件 vs 生产远程 D1 |
| `Pages Function` | `_worker.js` | functions/ 目录（dist 同级，但易丢）vs dist/_worker.js（高级模式）|
| `dev server` | `wrangler dev` | Vite (5173) vs Worker 模拟 (8787) |
| `pnpm dev:web` | `pnpm dev:api` | 前端 / 后端，两个进程并行跑 |

---

## 四、常用 ts_code 速查（本地调试用）

| ts_code | 名称 | 行业 |
|---------|------|------|
| `000001.SZ` | 平安银行 | 银行 |
| `600519.SH` | 贵州茅台 | 白酒 |
| `300750.SZ` | 宁德时代 | 锂电池 |
| `601318.SH` | 中国平安 | 保险 |
| `300502.SZ` | 新易盛 | 通信设备 |

调试 K 线 / 财报功能时这几只数据完整、变动活跃，方便观察。
