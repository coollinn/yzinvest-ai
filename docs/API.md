# YZInvest AI — 后端 API 文档

> 最后更新：2026.05.01
> 版本：2.0.0
> Base URL（生产）：`https://yzinvest-ai-api.coollinn.workers.dev`
> Base URL（本地）：`http://localhost:8787`

---

## 基础信息

### 认证
- 方式：Bearer Token（JWT）
- 登录接口：`POST /api/auth/login`
- 后续请求：`Authorization: Bearer <access_token>`
- Token 有效期：JWT 默认 24 小时（见 `expires_at` 字段）
- 管理员账号：leon / YzInvest2026!

### 通用响应格式
```json
// 成功
{ "success": true, "data": { ... } }

// 失败
{ "ok": false, "error": { "code": "ERROR_CODE", "message": "错误描述" } }
```

### 常用错误码
| code | HTTP | 说明 |
|------|------|------|
| VALIDATION_ERROR | 422 | 请求参数验证失败 |
| NOT_FOUND | 404 | 资源不存在 |
| UNAUTHORIZED | 401 | 未认证或 Token 无效 |
| FORBIDDEN | 403 | 无权限 |
| RATE_LIMITED | 429 | 请求频率超限 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |

### 东方财富数据源
- 实时行情：`push2delay.eastmoney.com`
- K线历史：`push2his.eastmoney.com`
- 财务数据：`datacenter.eastmoney.com`
- 缓存策略：KV 缓存 24 小时（财务数据）

---

## 目录

1. [认证模块 (Auth)](#1-认证模块-auth)
2. [股票模块 (Stocks)](#2-股票模块-stocks)
3. [K线数据模块 (Daily)](#3-k线数据模块-daily)
4. [财务数据模块 (Financial)](#4-财务数据模块-financial)
5. [自选股模块 (Favorites)](#5-自选股模块-favorites)
6. [笔记模块 (Notes)](#6-笔记模块-notes)
7. [估值模块 (Valuation)](#7-估值模块-valuation)
8. [管理员模块 (Admin)](#8-管理员模块-admin)

---

## 1. 认证模块 (Auth)

> 路由前缀：`/api/auth`

### 1.1 注册用户
```
POST /api/auth/register
```
**请求体：**
```json
{
  "username": "string (3-32字符，字母/数字/下划线/中划线)",
  "email": "string (邮箱格式)",
  "password": "string (8-72字符)",
  "full_name": "string (可选，最多50字符)"
}
```
**响应：**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGc...",
    "refresh_token": "eyJhbGc...",
    "expires_at": "2026-05-02T...",
    "user": {
      "id": 1,
      "username": "leon",
      "email": "leon@example.com",
      "full_name": "陈林",
      "role": "user",
      "created_at": "2026-01-01T00:00:00Z"
    }
  }
}
```

### 1.2 用户登录
```
POST /api/auth/login
```
**请求体：**
```json
{
  "username": "leon",
  "password": "YzInvest2026!"
}
```
**响应：** 同注册，`user.role` 为 `"user"` 或 `"admin"`

### 1.3 刷新 Token
```
POST /api/auth/refresh
```
**请求体：**
```json
{ "refresh_token": "eyJhbGc..." }
```

### 1.4 获取当前用户
```
GET /api/auth/me
```
**认证：** 必须 | **响应：** `user` 对象（同上）

### 1.5 登出
```
POST /api/auth/logout
```
**认证：** 必须 | **响应：** `{ "success": true }`
> 注意：JWT 无状态，前端自行清除 Token 即可

---

## 2. 股票模块 (Stocks)

> 路由前缀：`/api/stocks` | **无需认证**（公开接口）

### 2.1 分页股票列表（本地数据库）
```
GET /api/stocks?page=1&limit=20
```
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| page | number | 1 | 页码 |
| limit | number | 20 | 每页数量（最大100） |

**响应：**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "ts_code": "000001.SZ",
        "symbol": "000001",
        "name": "平安银行",
        "exchange": "SZ",
        "market": "主板",
        "list_status": "L"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 100,
      "total_items": 2000,
      "items_per_page": 20,
      "has_next": true,
      "has_prev": false
    }
  }
}
```

### 2.2 实时行情列表（东方财富）
```
GET /api/stocks/list?page=1&pageSize=50&sort=pct_chg&market=HS
```
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| page | number | 1 | 页码 |
| pageSize | number | 50 | 每页数量（最大100） |
| sort | string | pct_chg | 排序：pct_chg/amount/volume/market_cap/current_price |
| market | string | HS | 市场：HS(沪深全A)/SH(沪市)/SZ(深市)/BJ(北交所)/ZT(涨停) |

### 2.3 股票搜索（本地模糊搜索）
```
GET /api/stocks/search?q=贵州&limit=20
```
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| q | string | 必填 | 搜索关键词（代码/名称/拼音/行业） |
| limit | number | 20 | 最大50 |

### 2.4 随机股票
```
GET /api/stocks/random?limit=100
```
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| limit | number | 100 | 最大200 |

### 2.5 批量实时行情
```
GET /api/stocks/quotes?ts_codes=000001.SZ,600519.SH
```
| 参数 | 类型 | 说明 |
|------|------|------|
| ts_codes | string | 逗号分隔，最多 100 只股票 |

### 2.6 主要指数行情
```
GET /api/stocks/indices
```
返回：上证指数、深证成指、创业板指、科创50、北证50 等主要指数实时数据

### 2.7 行业板块列表
```
GET /api/stocks/industries
```
返回：东方财富行业板块列表（涨跌幅/成交量等）

### 2.8 单只股票基本信息
```
GET /api/stocks/:identifier
```
`:identifier` 可以是 `ts_code`（如 `000001.SZ`）或数字 `id`

### 2.9 股票详情（含实时行情）
```
GET /api/stocks/:identifier/detail
```
返回：
- `stock`：基础信息
- `quote`：东方财富实时行情
- `analysis_data`：当前价/涨跌幅/成交量等
- `has_real_data`：是否有行情数据
- `has_financial_data`：是否有财务数据
- `secid`：东方财富 secid（用于行情接口）

---

## 3. K线数据模块 (Daily)

> 路由前缀：`/api/daily`

### 3.1 获取K线数据
```
GET /api/daily/:ts_code?range=3M
```
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| ts_code | string | 必填 | 股票代码，如 `000001.SZ` |
| range | string | 3M | 时间范围：1W/1M/3M/6M/1Y/3Y |

**数据来源：** 优先查本地数据库；数据不足时自动从东方财富拉取并回填。

**响应：**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "ts_code": "000001.SZ",
        "trade_date": "20260501",
        "open": 12.50,
        "high": 13.20,
        "low": 12.30,
        "close": 13.00,
        "pre_close": 12.50,
        "change": 0.50,
        "pct_chg": 4.00,
        "vol": 1234567,
        "amount": 12345678.90
      }
    ],
    "count": 60,
    "source": "database | eastmoney | empty"
  }
}
```

### 3.2 指定周期K线
```
GET /api/daily/:ts_code/period/:period
```
| period | 说明 |
|--------|------|
| 101 | 日K |
| 102 | 周K |
| 103 | 月K |
| 104 | 季K |

默认拉取最近 3 年数据。

---

## 4. 财务数据模块 (Financial)

> 路由前缀：`/api/financial/:ts_code` | **无需认证**

**缓存策略：** KV 缓存 24 小时，响应头 `X-Cache: HIT/MISS` 标识。

### 4.1 主要财务指标
```
GET /api/financial/:ts_code/main-indicators
```
返回：PE_TTM、PB_LYR、ROE、每股收益、每股净资产、营收增长率、净利润增长率等

### 4.2 利润表
```
GET /api/financial/:ts_code/income-statement
```
返回：按报告期组织的利润表数据（营业收入、净利润等）

### 4.3 资产负债表
```
GET /api/financial/:ts_code/balance-sheet
```
返回：按报告期组织的资产负债表数据

### 4.4 现金流量表
```
GET /api/financial/:ts_code/cash-flow
```
返回：按报告期组织的现金流量表数据

### 4.5 财务总览
```
GET /api/financial/:ts_code/overview
```
返回：关键指标汇总（PE/PB/ROE/营收增长等，含单位）

### 4.6 刷新财务数据（清除缓存）
```
POST /api/financial/:ts_code/sync
```
**认证：** 必须（admin）

---

## 5. 自选股模块 (Favorites)

> 路由前缀：`/api/favorites` | **必须认证**

### 5.1 获取自选股列表
```
GET /api/favorites
```
响应：`items` 数组，含股票基础信息

### 5.2 添加自选股
```
POST /api/favorites
```
**请求体：**
```json
{ "ts_code": "000001.SZ" }
```

### 5.3 删除自选股
```
DELETE /api/favorites/:ts_code
```

### 5.4 检查是否已自选
```
GET /api/favorites/:ts_code/check
```

### 5.5 批量调整顺序
```
PUT /api/favorites/reorder
```
**请求体：**
```json
{ "order": ["600519.SH", "000001.SZ", "300750.SZ"] }
```

---

## 6. 笔记模块 (Notes)

> 路由前缀：`/api/notes` | **必须认证**

### 6.1 获取笔记列表
```
GET /api/notes?page=1&limit=20&ts_code=000001.SZ
```
| 参数 | 说明 |
|------|------|
| page/limit | 分页参数 |
| ts_code | 可选，筛选特定股票的笔记 |

### 6.2 创建/更新笔记
```
POST /api/notes
```
**请求体：**
```json
{
  "ts_code": "000001.SZ",
  "content": "分析内容...",
  "analysis_type": "DCF | CAPM | Technical | Fundamental | Other",
  "rating": 4,
  "tags": ["低估值", "银行"]
}
```
> 同一股票的笔记是唯一的（存在则更新）

### 6.3 获取单条笔记
```
GET /api/notes/:id
```

### 6.4 更新笔记
```
PUT /api/notes/:id
```
部分字段更新：content/analysis_type/rating/tags

### 6.5 删除笔记
```
DELETE /api/notes/:id
```

---

## 7. 估值模块 (Valuation)

> 路由前缀：`/api/valuation` | **可选认证**

### 7.1 DCF 估值
```
POST /api/valuation/:ts_code/dcf
```
**请求体：**
```json
{
  "freeCashFlow": 100000,
  "growthRate": 10,
  "discountRate": 10,
  "terminalGrowth": 3
}
```
| 字段 | 类型 | 说明 |
|------|------|------|
| freeCashFlow | number | 自由现金流（万元） |
| growthRate | number | 增长率（%） |
| discountRate | number | 折现率（%） |
| terminalGrowth | number | 永续增长率（%） |

**响应：** intrinsicValue（内在价值）、marginOfSafety（安全边际）等

### 7.2 CAPM 估值
```
POST /api/valuation/:ts_code/capm
```
**请求体：**
```json
{
  "riskFreeRate": 3.0,
  "marketReturn": 10.0,
  "beta": 1.2
}
```

---

## 8. 管理员模块 (Admin)

> 路由前缀：`/api/admin` | **必须 admin 角色**

### 8.1 管理面板
```
GET /api/admin/dashboard
```
返回：用户数/笔记数/自选数/股票总数

### 8.2 用户列表
```
GET /api/admin/users
```

### 8.3 同步股票数据（单页）
```
POST /api/admin/sync/stocks
```
**Query 参数：**
| 参数 | 默认 | 说明 |
|------|------|------|
| market | HS | 市场类型 |
| page | 1 | 页码 |
| pageSize | 200 | 每页数量 |
| syncDaily | true | 是否同步日K数据 |

### 8.4 批量同步股票（多页）
```
POST /api/admin/sync/stocks/all
```
**Query 参数：**
| 参数 | 默认 | 说明 |
|------|------|------|
| market | HS | 市场类型 |
| pageSize | 200 | 每页数量 |
| maxPages | 5 | 最大页数 |

---

## 附录：数据库表结构

| 表名 | 说明 |
|------|------|
| users | 用户 |
| stocks | 股票基础信息 |
| stock_daily | 日K行情数据 |
| financial_data | 财务数据 |
| notes | 投资笔记 |
| favorites | 自选股 |
| valuation_cache | 估值结果缓存 |

### stocks 表关键字段
- `ts_code`：标准股票代码（如 `000001.SZ`）
- `symbol`：6位代码
- `name`：股票名称
- `exchange`：交易所（SH/SZ/BJ）
- `market`：市场（主板/科创板/创业板/北交所）
- `list_status`：上市状态（L=上市/D=退市/P=暂停）

### stock_daily 表关键字段
- `trade_date`：交易日期（YYYYMMDD）
- `open/high/low/close`：开/高/低/收盘价（元）
- `pre_close`：昨收价
- `change/pct_chg`：涨跌额/涨跌幅
- `vol/amount`：成交量/成交额
