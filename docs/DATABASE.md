# 数据库（D1 + Drizzle）

> 最后更新：2026.05.01
> Schema 详解 + migration 工作流。任何数据库相关问题先翻这里。

数据库源代码：[`apps/api/src/db/schema.ts`](../apps/api/src/db/schema.ts)
Drizzle 配置：[`apps/api/drizzle.config.ts`](../apps/api/drizzle.config.ts)
迁移文件：[`apps/api/drizzle/migrations/`](../apps/api/drizzle/migrations/)

---

## 1. 表结构总览

7 张表，关系简单：

```
users  ┐
       ├─→ notes       (user_id FK, ts_code 文本关联 stocks)
       ├─→ favorites   (user_id FK, ts_code 文本关联 stocks)
       └─→ valuation_cache (user_id 可空，按 ts_code + type + params_hash 缓存)

stocks  ─── ts_code ─→ stock_daily       (复合主键 ts_code + trade_date)
                  │
                  └─→ financial_data     (长表：长长长 key-value 模式)
```

外键设计原则：
- `users.id` → `notes / favorites` 用 **整数 FK + cascade delete**
- 股票相关表用 **`ts_code` 文本关联**（不用整数 id），因为 `ts_code` 业务唯一且语义清晰

---

## 2. 表详解

### 2.1 `users`

```ts
users {
  id:            integer PK autoincrement
  username:      text unique not null
  email:         text unique not null
  password_hash: text not null      // bcryptjs cost=10
  full_name:     text
  role:          enum('user'|'admin') default 'user'
  created_at:    text default CURRENT_TIMESTAMP
  updated_at:    text default CURRENT_TIMESTAMP
}
```

- 第一个用户注册后**默认是 user**。提权 admin 必须直接改 D1：
  ```bash
  pnpm --filter @yzinvest/api exec wrangler d1 execute yzinvest --remote \
    --command "UPDATE users SET role='admin' WHERE username='leon'"
  ```

### 2.2 `stocks`

```ts
stocks {
  id:           integer PK autoincrement
  ts_code:      text unique not null   // 主业务键，"000001.SZ"
  symbol:       text not null          // "000001"
  name:         text not null          // "平安银行"
  area:         text
  industry:     text
  fullname:     text
  enname:       text
  cnspell:      text                   // 拼音搜索用
  market:       text                   // 主板 / 创业板 / 科创板 / 北交所
  exchange:     text                   // SH / SZ / BJ
  curr_type:    text
  list_status:  text                   // L=上市 / D=退市 / P=暂停
  list_date:    text                   // YYYYMMDD
  delist_date:  text
  is_hs:        text
  act_name:     text
  act_ent_type: text
  created_at:   text
  updated_at:   text
}

索引:
  uq_stocks_ts_code (unique)
  idx_stocks_industry
  idx_stocks_cnspell
  idx_stocks_name
```

数据来源：东方财富 `push2.eastmoney.com/api/qt/clist/get` 同步。

### 2.3 `stock_daily`

日 K 线数据。**复合主键 = (ts_code, trade_date)**。

```ts
stock_daily {
  ts_code:    text not null
  trade_date: text not null    // YYYYMMDD（不是 YYYY-MM-DD！）
  open:       real
  high:       real
  low:        real
  close:      real
  pre_close:  real
  change:     real             // 绝对涨跌额（元）
  pct_chg:    real             // 涨跌幅（百分点数值，如 1.28，不是 0.0128）
  vol:        real             // 成交量（手）
  amount:     real             // 成交额（元）
  created_at: text

  PRIMARY KEY (ts_code, trade_date)
}

索引:
  idx_daily_date (trade_date)
```

> **价格 / 成交量字段坑**：
> - `vol` 单位是**手**（不是股，1 手 = 100 股 A 股）
> - `amount` 单位是**元**（不是千元；从东财 f20 取，已是元）
> - `pct_chg` 是**百分点数值**：1.28 表示涨 1.28%

### 2.4 `financial_data`

财务数据**长表**结构，因为 cninfo / 东财 字段动态：

```ts
financial_data {
  id:             integer PK
  ts_code:        text not null
  report_type:    enum('year'|'middle'|'one'|'three')   // 年报/半年报/一季报/三季报
  report_date:    text not null                          // YYYY-MM-DD
  financial_type: enum('balance_sheet'|'income_statement'|'cash_flow'|'main_indicators')
  data_key:       text not null                          // "货币资金" / "营业总收入" 等
  data_value:     real
  data_unit:      text                                   // "万元" / "%"
  created_at:     text
  updated_at:     text
}

索引:
  uq_fin (ts_code, financial_type, report_type, report_date, data_key) UNIQUE
  idx_fin_code (ts_code)
```

读取时通过 SQL 透视回宽表。前端拿到的格式：

```ts
{
  data: {
    year: {
      "2024-12-31": { "货币资金": { value: 160026.91, unit: "万元" } },
      "2023-12-31": { ... }
    },
    middle: { ... },
    one: { ... },
    three: { ... }
  }
}
```

### 2.5 `notes`

```ts
notes {
  id:            integer PK
  user_id:       integer FK users(id) ON DELETE CASCADE
  ts_code:       text not null      // 文本关联，不强制存在
  content:       text not null
  analysis_type: text               // DCF / CAPM / Technical / Fundamental / Other
  rating:        integer            // 1-5
  tags:          json (string[])
  created_at:    text
  updated_at:    text
}

索引:
  idx_notes_user (user_id)
  idx_notes_code (ts_code)
```

业务规则：每个 `(user_id, ts_code)` 只能有一条 note，再次 POST 会更新已有。

### 2.6 `favorites`

```ts
favorites {
  id:         integer PK
  user_id:    integer FK users(id) ON DELETE CASCADE
  ts_code:    text not null
  sort_order: integer default 0     // 拖拽排序
  created_at: text
}

索引:
  uq_fav (user_id, ts_code) UNIQUE
  idx_fav_user (user_id)
```

`PUT /api/favorites/reorder` 一次提交完整顺序数组，后端按数组下标更新 `sort_order`。

### 2.7 `valuation_cache`

```ts
valuation_cache {
  id:          integer PK
  user_id:     integer (nullable，匿名估值也缓存)
  ts_code:     text not null
  type:        enum('dcf'|'capm')
  params_hash: text not null          // SHA-256(JSON.stringify(input))
  result:      json not null
  expires_at:  text not null          // ISO 8601
  created_at:  text
}

索引:
  uq_val (user_id, ts_code, type, params_hash) UNIQUE
```

KV 同时缓存一份带 6h TTL 的副本，D1 这张表用作"用户历史估值记录"（未来可视化）。

---

## 3. Migration 工作流

### 3.1 改 schema 三步走

```bash
# 第 1 步：在 apps/api/src/db/schema.ts 编辑表结构

# 第 2 步：生成 SQL migration
pnpm db:generate
# → apps/api/drizzle/migrations/NNNN_xxx.sql 自动生成
#   apps/api/drizzle/migrations/meta/_journal.json 自动更新

# 第 3 步：把生成的文件 commit + push
git add apps/api/drizzle/migrations/
git commit -m "feat(db): add foo column to bar"
git push
```

CI（`.github/workflows/deploy-api.yml`）会自动跑 `wrangler d1 migrations apply yzinvest --remote`，把 migration 应用到生产 D1。

### 3.2 本地验证

部署到生产前，**强烈建议**先在本地 D1 跑一下：

```bash
pnpm db:migrate:local
# → 应用到 .wrangler/state/v3/d1/.../<db>.sqlite

# 启动 wrangler dev 验证业务能跑通
pnpm dev:api
```

### 3.3 关键坑

> **migration SQL 必须 commit 到 git**！
> 本地生成了 `0000_xxx.sql` 但忘记 commit，CI 拉取后该文件不存在，结果远程 D1 永远没有任何表，所有 API 调用 silently fail。
> 这是踩过的坑，详见 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)。

### 3.4 紧急排错命令

```bash
# 看远程 D1 有哪些表
pnpm --filter @yzinvest/api exec wrangler d1 execute yzinvest --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table'"

# 看某张表行数
pnpm --filter @yzinvest/api exec wrangler d1 execute yzinvest --remote \
  --command "SELECT COUNT(*) FROM stocks"

# 看 migration 历史
pnpm --filter @yzinvest/api exec wrangler d1 migrations list yzinvest --remote
```

---

## 4. 数据量预估

| 表 | 行数预估（沪深全 A）| 增长速率 |
|----|---------------------|----------|
| stocks | ~5400 | 几乎不变（年度新股 +200）|
| stock_daily | 5400 × 250 / 年 ≈ 135 万 / 年 | +5400 / 交易日 |
| financial_data | 5400 × 4 期 × 4 表 × 30 字段 ≈ 260 万（一次性同步全量后）| 季度 +5400×4×30 |
| notes / favorites | 与用户数线性相关 | 用户驱动 |

D1 免费 5 GB / 500 万行读/天，覆盖至少 3 年数据 + 上千日活用户。

---

## 5. 与 v1（FastAPI/SQLAlchemy）的差异

| 维度 | v1 | v2 |
|------|-----|-----|
| ORM | SQLAlchemy（Python）| Drizzle（TypeScript）|
| Migrations | 没接入 Alembic，删库重建 | drizzle-kit + wrangler 自动应用 |
| 索引 | 没特别加 | 加了 industry / cnspell / name 索引 |
| `users.role` | 不存在，靠 username 含 "admin" 判断 | 真正的 enum 字段 |
| `notes.tags` | 不存在 | `json` 数组字段 |
| `favorites.sort_order` | 不存在 | 整数，支持拖拽排序 |
| `valuation_cache` | 不存在 | 新增表，按参数 hash 缓存估值 |
| `sessions` 表 | 存在（自定义 token） | **删除**，改为无状态 JWT |
