# YZInvest AI v3 开发计划

> 版本：v3
> 日期：2026-05-01
> 状态：Phase 1 ✅ + Phase 2 ✅ 已完成（2026-05-01）

---

## 一、需求概述

### 1.1 用户痛点

1. **UI 信息密度低**：当前股票详情页采用卡片式布局，信息量少，用户需频繁切换 Tab 才能看到完整数据
2. **数据不完整**：股票基础数据（Tushare 日线）不全，财报数据依赖用户首次访问触发，缺少批量同步
3. **估值模型参数手动填写**：DCF/CAPM 参数需要用户手动输入，没有 AI 辅助分析财报来自动填充

### 1.2 目标

1. 改造为 Cloudflare Dashboard 风格：左侧固定导航 + 主区域高密度多卡片布局
2. 完善数据层：批量同步 Tushare 日线 + cninfo 财报，提供数据状态概览
3. 新增 AI 财报分析功能：AI 读取财报关键数据 → 自动填充估值模型 → 输出估值建议

---

## 二、方案设计

### 2.1 UI 改造：侧边导航 + 高密度布局

#### 参考设计（Cloudflare Dashboard）

```
┌─────────────────────────────────────────────────────────┐
│  ☁️ YZInvest AI              [用户] ⚙️ 🌙            │
├────────────┬────────────────────────────────────────────┤
│            │                                            │
│  📊 市场   │   [高密度内容区：多卡片 + 图表 + 数据表]   │
│  ─────────│                                            │
│  📈 自选   │   ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  💼 股票   │   │ K线图    │ │ 行情卡片  │ │ 指标卡  │ │
│  📝 笔记   │   │          │ │ (行情/    │ │ (估值/  │ │
│  ─────────│   │          │ │  财务/    │ │  财务/  │ │
│  ⚙️ 设置   │   │          │ │  成交)    │ │  评级)  │ │
│  👤 管理   │   └──────────┘ └──────────┘ └─────────┘ │
│            │                                            │
│  [退出]   │   [财报表格 / 估值面板 / 笔记列表]          │
│            │                                            │
└────────────┴────────────────────────────────────────────┘
```

#### 改造文件清单

| 文件 | 改动说明 |
|------|----------|
| `apps/web/src/App.vue` | 改造为 SidebarLayout 布局：侧边导航 + 顶部栏 + 主内容区 |
| `apps/web/src/components/layout/Sidebar.vue` | **新增**：左侧导航组件，支持：首页/市场、自选股、股票列表、笔记、设置、管理后台 |
| `apps/web/src/components/layout/TopBar.vue` | **新增**：顶部栏：Logo + 用户信息 + 主题切换 + 退出 |
| `apps/web/src/pages/StockDetail.vue` | 改造为高密度多卡片布局：左侧 K 线图 + 右侧多指标卡 + 底部数据面板 |
| `apps/web/src/pages/Home.vue` | 改造为仪表盘：市场概览 + 自选股动态 + 快速入口 |
| `apps/web/src/pages/Stocks.vue` | 改造为列表+筛选+详情侧边抽屉模式 |
| `apps/web/src/components/stock/KLineChart.vue` | 增强：支持更多时间周期切换（周/月/季/年）|
| `apps/web/src/components/stock/FinancialPanel.vue` | 增强：支持多报表类型切换 + 数据趋势图 |
| `apps/web/src/components/stock/ValuationPanel.vue` | **新增**：AI 自动填充功能 |
| `apps/web/src/components/stock/AIAnalysisPanel.vue` | **新增**：AI 财报分析结果展示 |

#### 侧边导航设计

```vue
<!-- Sidebar.vue -->
<template>
  <aside class="sidebar">
    <div class="logo">☁️ YZInvest AI</div>
    <nav>
      <NavItem icon="home" label="首页" to="/" :active="route.name === 'home'" />
      <NavItem icon="star" label="自选股" to="/favorites" badge="5" />
      <NavItem icon="chart" label="股票列表" to="/stocks" />
      <NavItem icon="notes" label="笔记" to="/notes" />
      <Divider />
      <NavItem icon="settings" label="设置" to="/settings" />
      <NavItem v-if="auth.isAdmin" icon="admin" label="管理后台" to="/admin" />
    </nav>
    <div class="user-section">
      <Avatar :name="auth.user?.username" />
      <span>{{ auth.user?.username }}</span>
    </div>
  </aside>
</template>
```

#### 股票详情页高密度布局

```
┌─────────────────────────────────────────────────────────┐
│  ← 返回  [贵州茅台 600519]  ★ 已收藏  🔄 刷新          │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ ┌────────────┐ │
│ │                                     │ │ 行情指标   │ │
│ │           K 线图（主区域）            │ │ 最新价     │ │
│ │                                     │ │ 涨跌幅     │ │
│ │  [日 周 月 季 年]                    │ ├────────────┤ │
│ │                                     │ │ 估值指标   │ │
│ │                                     │ │ DCF 内在值 │ │
│ └─────────────────────────────────────┘ │ 安全边际   │ │
│ ┌──────────┐ ┌──────────┐              │ ├────────────┤ │
│ │财务指标  │ │估值建议  │              │ │ AI 评分   │ │
│ │ROE/净利  │ │低估/合理 │              │ │ 85/100   │ │
│ └──────────┘ └──────────┘              └────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [财报 tab] [估值 tab] [笔记 tab] [AI 分析 tab]       │ │
│ │                                                     │ │
│ │ 资产负债表 │ 利润表 │ 现金流量表 │ 主要指标           │ │
│ │ ┌─────────────────────────────────────────────────┐ │ │
│ │ │ 科目          │ 2024Q3 │ 2024Q2 │ 2024Q1 │ ... │ │ │
│ │ │ 净利润         │  216亿  │  203亿  │  189亿  │     │ │ │
│ │ │ 净资产收益率   │  15.2%  │  14.8%  │  13.9%  │     │ │ │
│ │ └─────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

### 2.2 数据补全方案

#### 2.2.1 问题分析

| 数据类型 | 当前状态 | 问题 |
|----------|----------|------|
| 股票基础信息 | Tushare `stock_basic` | 仅同步了基本信息，缺少日线数据 |
| 日线数据 | 依赖用户访问触发 | 数据不全，无法做历史分析 |
| 财报数据 | cninfo 爬虫，首次访问触发 | 缺少批量同步机制 |

#### 2.2.2 解决方案

**方案 A：Tushare 高级接口（推荐）**

Tushare Pro 有更完整的数据接口：
- `daily`（日线行情）：历史日线数据，支持批量
- `bak_daily`（备用行情）：补充历史数据
- `fina_indicator`（财务指标）：主要财务指标汇总
- `forecast`（业绩预告）：业绩预告数据
- 限流：Pro 版 2000次/分钟（免费版 200次/分钟）

**方案 B：定期批量同步（实现路径）**

在现有 Cron 基础上扩展：

```typescript
// apps/api/src/crons/sync-all.ts（新增）
cron.schedule('0 16 * * 1-5', async () => {
  // 1. 同步股票基础数据（每周一）
  // 2. 增量同步日线（每个交易日 16:30 后）
  // 3. 同步重点关注股票的财报数据（每日限量 50 只）
  // 4. 记录同步日志到 KV
});
```

**数据同步优先级**：

| 优先级 | 数据类型 | 同步频率 | 触发方式 |
|--------|----------|----------|----------|
| P0 | 股票基础信息 | 每周一 | Cron |
| P0 | 重点自选股日线 | 每日 16:30 | Cron |
| P1 | 所有股票日线 | 每日 23:00 | Cron |
| P1 | 自选股财报（年报/季报） | 每日限额 50 只 | Cron |
| P2 | 全部股票财报 | 用户访问触发 | API |

#### 2.2.3 数据 API 扩展

```typescript
// apps/api/src/routes/stocks.ts 扩展

// 获取日线历史（支持时间范围筛选）
app.get('/:ts_code/daily', async (c) => {
  const { start_date, end_date } = c.req.query();
  // 支持 Tushare daily 接口查询历史数据
});

// 批量获取多只股票的日线
app.post('/batch/daily', async (c) => {
  const { ts_codes } = await readJson(c);
  // 支持逗号分隔的股票代码列表，最多 100 只
});

// 数据状态概览（供前端展示同步状态）
app.get('/sync-status', async (c) => {
  // 返回：今日同步状态、各类数据覆盖率、最后更新时间
});
```

---

### 2.3 AI 财报分析 + 自动估值

#### 2.3.1 整体流程

```
┌──────────────────────────────────────────────────────────────┐
│                    AI 财报分析流程                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  用户点击"AI 分析财报"                                        │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────┐                                         │
│  │ 1. 收集财报数据  │                                        │
│  │   - 近3年年报    │                                        │
│  │   - 近4期季报    │                                        │
│  │   - 主要财务指标 │                                        │
│  └────────┬────────┘                                         │
│           │                                                   │
│           ▼                                                   │
│  ┌─────────────────┐                                         │
│  │ 2. 调用 AI 模型  │                                        │
│  │   Claude API     │                                        │
│  │   (gpt-4o 等)    │                                        │
│  └────────┬────────┘                                         │
│           │                                                   │
│           ▼                                                   │
│  ┌─────────────────┐                                         │
│  │ 3. AI 分析输出   │                                        │
│  │   - 关键指标提取  │                                        │
│  │   - 趋势分析      │                                        │
│  │   - 风险识别      │                                        │
│  │   - 估值建议      │                                        │
│  └────────┬────────┘                                         │
│           │                                                   │
│           ▼                                                   │
│  ┌─────────────────┐                                         │
│  │ 4. 自动填充估值  │                                        │
│  │   DCF: 自由现金流 │                                        │
│  │   DCF: 增长率    │                                        │
│  │   DCF: 折现率    │                                        │
│  │   CAPM: Beta    │                                        │
│  └────────┬────────┘                                         │
│           │                                                   │
│           ▼                                                   │
│  ┌─────────────────┐                                         │
│  │ 5. 生成分析报告  │                                        │
│  │   - AI 评分     │                                        │
│  │   - 估值区间     │                                        │
│  │   - 投资建议     │                                        │
│  └─────────────────┘                                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 2.3.2 AI 提示词设计

```typescript
// apps/api/src/services/ai-analyst.ts

const FINANCIAL_ANALYSIS_PROMPT = `
你是一位专业的A股股票分析师。请分析以下股票的最新财务数据，输出结构化的分析结果。

股票信息：
- 股票代码：{ts_code}
- 股票名称：{name}
- 行业：{industry}

财务数据（单位：万元）：

【利润表关键数据】
{income_statement_data}

【资产负债表关键数据】
{balance_sheet_data}

【现金流量表关键数据】
{cash_flow_data}

【主要财务指标】
{key_indicators}

请按以下JSON格式输出分析结果（只输出JSON，不要有其他内容）：

{
  "ai_score": 85,  // 0-100的综合评分
  "ai_confidence": "high",  // confidence: high/medium/low

  "key_findings": [
    "净利润近3年复合增长率15.2%，表现良好",
    "净资产收益率(ROE)稳定在15%以上，具有竞争力",
    "经营现金流持续为正，财务健康"
  ],

  "risk_factors": [
    "应收账款增长较快，需关注回款风险",
    "行业竞争加剧，毛利率有下降趋势"
  ],

  "dcf_params": {
    "free_cash_flow": 2160000,  // 自由现金流（万元）
    "growth_rate": 10.5,  // 预期增长率（%）
    "discount_rate": 9.5,  // 折现率（%）
    "terminal_growth": 3.0  // 永续增长率（%）
  },

  "capm_params": {
    "beta": 0.85,  // 历史Beta值
    "risk_free_rate": 2.5,  // 无风险利率（%）
    "market_return": 10.0  // 市场预期收益率（%）
  },

  "valuation_summary": {
    "dcf_intrinsic_value": 1850.00,  // DCF内在价值（元/股）
    "pe_ratio": 28.5,  // 当前市盈率
    "pb_ratio": 5.2,  // 当前市净率
    "suggested_range_low": 1680.00,  // 建议低估价区间（元/股）
    "suggested_range_high": 2100.00  // 建议高估价区间（元/股）
  },

  "investment_advice": "低估",
  // investment_advice: 强烈推荐/推荐/中性/谨慎/不推荐

  "analysis_summary": "该公司财务状况良好，具有稳定的盈利能力和健康的现金流..."
}
`;
```

#### 2.3.3 新增文件清单

| 文件 | 说明 |
|------|------|
| `apps/api/src/routes/ai.ts` | **新增**：AI 分析 API（调用 Claude/DeepSeek 等） |
| `apps/api/src/services/ai-analyst.ts` | **新增**：AI 分析服务（提示词模板 + 结果解析） |
| `apps/api/src/services/openrouter.ts` | **新增**：OpenRouter 统一调用封装（支持多模型） |
| `apps/api/wrangler.toml` | 新增 `AI_API_KEY` secret 配置 |
| `apps/web/src/components/stock/AIAnalysisPanel.vue` | **新增**：AI 分析结果展示组件 |
| `apps/web/src/components/stock/ValuationPanel.vue` | 改造：增加"AI 自动填充"按钮 |
| `apps/web/src/lib/ai.ts` | **新增**：前端 AI 调用封装 |

#### 2.3.4 API 接口设计

```typescript
// POST /api/ai/:ts_code/analyze
// 请求体（可选，AI 自动收集数据）
{
  "force_refresh": false  // 是否强制重新分析
}

// 响应
{
  "ok": true,
  "data": {
    "ts_code": "600519.SH",
    "analyzed_at": "2026-05-01T12:00:00Z",
    "ai_score": 85,
    "ai_confidence": "high",
    "key_findings": [...],
    "risk_factors": [...],
    "dcf_params": {...},
    "capm_params": {...},
    "valuation_summary": {...},
    "investment_advice": "低估",
    "analysis_summary": "..."
  }
}

// 缓存策略：同一股票分析结果缓存 24 小时
// 存储：D1 表 ai_analysis_results
```

---

## 三、开发计划（分阶段实施）

### Phase 1：UI 改造（预计 2-3 天）✅ **已完成**

| 任务 | 文件 | 状态 |
|------|------|------|
| 新增 Sidebar.vue 侧边导航组件 | `apps/web/src/components/layout/Sidebar.vue` | ✅ 已完成 |
| 新增 TopBar.vue 顶部栏组件 | `apps/web/src/components/layout/TopBar.vue` | ✅ 已完成（合并到 Sidebar 底部）|
| 改造 App.vue 布局 | `apps/web/src/App.vue` | ✅ 已完成 |
| 改造 StockDetail.vue 高密度布局 | `apps/web/src/pages/StockDetail.vue` | ✅ 已完成 |
| 改造 Home.vue 仪表盘 | `apps/web/src/pages/Home.vue` | ✅ 已完成 |
| 增强 KLineChart.vue 多周期切换 | `apps/web/src/components/stock/KLineChart.vue` | ✅ 保留原功能 |
| 增强 FinancialPanel.vue 多报表切换 | `apps/web/src/components/stock/FinancialPanel.vue` | ✅ 保留原功能 |

### Phase 2：数据层完善（预计 2-3 天）✅ **已完成**

| 任务 | 文件 | 状态 |
|------|------|------|
| 新增东方财富 API 服务层 | `apps/api/src/services/eastmoney.ts` | ✅ 已完成 |
| 改造 stocks.ts（实时行情 + 指数 + 行业）| `apps/api/src/routes/stocks.ts` | ✅ 已完成 |
| 改造 daily.ts（东方财富 K 线替换 Tushare）| `apps/api/src/routes/daily.ts` | ✅ 已完成 |
| 改造 financial.ts（东方财富财报替换 cninfo）| `apps/api/src/routes/financial.ts` | ✅ 已完成 |
| 改造 sync-stocks.ts（东方财富批量行情）| `apps/api/src/crons/sync-stocks.ts` | ✅ 已完成 |
| 扩展 shared 类型（market_cap / pe_ttm / amount 等）| `packages/shared/src/types.ts` | ✅ 已完成 |

**技术选型变更说明**：原计划使用 Tushare 日线 + cninfo 财报爬虫，改为东方财富 API。主要原因：
- Tushare 免费版限流严重（200次/分钟），实测频繁 500 错误
- cninfo 爬虫 Cookie 易失效，数据不稳定
- 东方财富 API 完全免费、稳定、无需注册，数据覆盖完整（行情/K线/财务/指数/板块）

### Phase 3：AI 财报分析（预计 3-5 天）

| 任务 | 文件 | 优先级 |
|------|------|--------|
| 新增 OpenRouter 服务封装 | `apps/api/src/services/openrouter.ts` | P0 |
| 新增 AI 分析服务 | `apps/api/src/services/ai-analyst.ts` | P0 |
| 新增 AI 分析 API | `apps/api/src/routes/ai.ts` | P0 |
| 新增 AI 分析面板组件 | `apps/web/src/components/stock/AIAnalysisPanel.vue` | P0 |
| 改造 ValuationPanel.vue（AI 自动填充）| `apps/web/src/components/stock/ValuationPanel.vue` | P1 |
| 配置 AI_API_KEY secret | `apps/api/wrangler.toml` + CI secrets | P0 |

### Phase 4：测试与优化（预计 1-2 天）

| 任务 | 优先级 |
|------|--------|
| UI 响应式适配测试 | P0 |
| API 接口测试 | P0 |
| AI 分析结果准确性验证 | P1 |
| 性能优化（懒加载、数据缓存）| P1 |

---

## 四、技术方案细节

### 4.1 AI 模型选型

| 模型 | 优势 | 劣势 | 建议场景 |
|------|------|------|----------|
| Claude 3.5 Sonnet | 中文理解强、推理能力强 | 价格较高 | 主要分析引擎 |
| GPT-4o | 通用能力强 | 中文稍弱 | 备选 |
| DeepSeek V2 | 性价比高 | 中文专业术语稍弱 | 成本敏感场景 |

推荐使用 **OpenRouter** 统一封装，配置 `AI_PROVIDER` 环境变量切换模型。

### 4.2 数据存储设计

```sql
-- 新增 D1 表：AI 分析结果
CREATE TABLE ai_analysis_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_code TEXT NOT NULL,
  analyzed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ai_score INTEGER,
  ai_confidence TEXT,
  key_findings TEXT,  -- JSON 数组
  risk_factors TEXT,  -- JSON 数组
  dcf_params TEXT,    -- JSON 对象
  capm_params TEXT,   -- JSON 对象
  valuation_summary TEXT, -- JSON 对象
  investment_advice TEXT,
  analysis_summary TEXT,
  UNIQUE(ts_code, analyzed_at)
);

-- 新增 D1 表：同步日志
CREATE TABLE sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_type TEXT NOT NULL,  -- 'daily' | 'financial' | 'stock_basic'
  ts_code TEXT,
  status TEXT NOT NULL,  -- 'success' | 'failed'
  records_count INTEGER,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3 成本估算

| 项目 | 单次成本 | 预计频率 | 月成本估算 |
|------|----------|----------|-----------|
| AI 财报分析（Claude 3.5 Sonnet）| ~$0.003/分析 | 100次/月 | ~$0.3 |
| Tushare Pro API | 免费（2000次/分钟）| - | $0 |
| cninfo 爬虫 | 免费 | - | $0 |
| Cloudflare Workers 调用 AI | ~$0.5/百万请求 | 100次/月 | $0.05 |

**月成本：< $1（极低）**

---

## 五、风险与注意事项

### 5.1 AI 分析局限性

1. **数据时效性**：AI 分析基于历史财报，无法预测突发事件
2. **模型幻觉**：AI 可能产生不准确的财务指标估算
3. **免责声明**：分析结果仅供参考，不构成投资建议

### 5.2 数据合规

1. **cninfo 爬虫**：需定期更新 Cookie，防止被封
2. **Tushare 限流**：批量同步时注意频率控制
3. **用户隐私**：AI 分析结果仅用户可见，不公开分享

### 5.3 后续扩展方向

1. **多模型对比**：同时调用多个 AI 模型，对比分析结果
2. **历史分析记录**：保存历史 AI 分析记录，支持趋势对比
3. **自定义分析维度**：用户选择关注的财务指标，定制分析重点
4. **社群分享**：支持将分析报告分享到飞书/微信

---

## 六、东方财富 API 技术文档（2026-05-01）

### 6.1 服务入口

```typescript
// apps/api/src/services/eastmoney.ts
// 导出函数：
export function fetchQuote(ts_code: string): Promise<Quote | null>
export function fetchQuotes(ts_codes: string[]): Promise<Quote[]>
export function fetchKline(ts_code, period?, startDate?, endDate?, limit?): Promise<KLineRow[]>
export function fetchStockList(page, pageSize, market?): Promise<{items, total, page, pageSize}>
export function fetchFinancialIndicator(ts_code): Promise<EmFinancialIndicator[]>
export function fetchLatestIndicator(ts_code): Promise<EmFinancialIndicator | null>
export function fetchFinancialReport(ts_code, reportType): Promise<EmFinancialReport[]>
export function fetchIndexQuotes(): Promise<IndexQuote[]>
export function fetchIndustryList(): Promise<{name, count}[]>
export function fetchConceptList(): Promise<{name, count}[]>
export function tsCodeToSecid(ts_code: string): string
export function secidToTsCode(secid: string): string
```

### 6.2 接口详情

#### 实时行情（单股）

```
GET https://push2.eastmoney.com/api/qt/stock/get
  ?secid=1.600519              # 1.=沪市, 0.=深市, 拼接股票代码
  &fields=f43,f44,f45,...      # 字段名
  &ut=bd1d9ddb04089700cf9c27f6f7426281
  &fltt=2                      # 价格精度：2=分
  &invt=2                      # 成交量精度：2=手

字段说明：
  f43=最新价  f44=涨跌额  f45=涨跌幅%  f46=成交量(手)
  f47=成交额(元)  f48=今开  f49=最高  f50=最低
  f51=今收  f52=昨收  f57=代码  f58=名称
  f107=市盈率TTM  f116=市净率  f117=总市值(元)
  f173=市销率TTM  f204=流通市值(元)  f205=市盈率(动态)

返回：{ data: { f43: 1850.00, f45: 2.35, f116: 11.20, ... } }
```

#### 批量实时行情（多股）

```
GET https://push2.eastmoney.com/api/qt/ulist.np/get
  ?secids=1.600519,0.000001,0.399006   # 逗号分隔
  &fields=f43,f44,f45,...,f57,f58
  &ut=...
```

#### 历史K线

```
GET https://push2his.eastmoney.com/api/qt/stock/kline/get
  ?secid=1.600519
  &fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12
  &fields2=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f15,f16,f17,f18
  &klt=101          # 周期：101=日K 102=周K 103=月K 104=季K
  &fqt=0            # 复权：0=不复权 1=前复权 2=后复权
  &end=20260501     # 截止日期 YYYYMMDD
  &beg=20240101     # 开始日期 YYYYMMDD
  &lmt=600          # 最大条数

返回：{ data: { klines: ["2024-01-02,1780.00,1805.50,1812.00,1775.00,3560000,66.8亿,2.15,1.43,25.50,1.99", ...] } }
```

#### 股票列表

```
GET https://push2.eastmoney.com/api/qt/clist/get
  ?pn=1                  # 页码
  &pz=50                 # 每页数量
  &po=1                  # 排序方向：1=降序
  &np=1
  &fid=f3                # 按涨跌幅排序
  &fs=m:0+t:80,m:0+t:81,m:1+t:23,m:1+t:80   # 沪深全A
  &fields=f12,f14,f3,f4,f5,f6,f7,f9,f10,f23,f24,f37,f62

fs 市场筛选参数：
  m:0+t:80      深市主板
  m:0+t:81      深市创业板
  m:1+t:23      沪市主板
  m:1+t:80      沪市科创板
  m:0+t:82      北交所
  m:0+t:84      可转债
  m:90+t:2      行业板块
  m:90+t:3      概念板块
```

#### 财务指标

```
GET https://datacenter.eastmoney.com/securities/api/data/v1/get
  ?reportName=RPT_FCI_PCST                    # 财务基本面指标
  &columns=SECURITY_CODE,REPORT_DATE,BASIC_EPS,BPS,ROE_AVG,PE_TTM,PB_LYR,YOYGR,YOYNI,...
  &filter=(SECURITY_CODE="600519")
  &pageNumber=1
  &pageSize=40
  &sortTypes=-1                              # 最新优先
  &sortColumns=REPORT_DATE
  &source=DataCenter
  &client=PC

报告类型 reportName：
  RPT_FCI_PCST        财务基本面指标（推荐）
  RPT_LICO_FN_CPD     合并利润表
  RPT_DMSK_FN_BAL     资产负债表
  RPT_DMSK_FN_CAS     现金流量表
```

#### 主要指数行情

```
GET https://push2.eastmoney.com/api/qt/ulist.np/get
  ?secids=1.000001,0.399001,0.399006,1.000688,1.000300
  &fields=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14
  &ut=...

指数 secid 对照：
  1.000001 = 上证指数
  0.399001 = 深证成指
  0.399006 = 创业板指
  1.000688 = 科创50
  1.000300 = 沪深300
```

### 6.3 ts_code ↔ secid 转换

```typescript
// 沪市 SH：1 + 股票代码（如 600519 → 1.600519）
// 深市 SZ：0 + 股票代码（如 000001 → 0.000001）
// 北交所 BJ：视为 SZ 前缀

function tsCodeToSecid(ts_code: string): string {
  const code = ts_code.split(".")[0];
  const market = ts_code.split(".")[1];
  if (market === "SH") return `1.${code}`;
  if (market === "SZ" || market === "BJ") return `0.${code}`;
  return `1.${code}`;
}
```

### 6.4 使用限制与注意事项

1. **请求频率**：建议单接口 1 秒不超过 10 次请求，个人使用足够
2. **Referer 头**：所有请求需携带 `Referer: https://finance.eastmoney.com/`
3. **数据校验**：价格/涨跌幅字段需除以 100（东方财富返回的是「分」和「厘」）
4. **市值转换**：总市值 f117 单位为元，需除以 1亿 转为「亿元」
5. **收盘后数据**：盘中实时行情在收盘后自动变为结算价
6. **复权方式**：K 线推荐使用前复权（fqt=1）以便技术分析

---

## 七、验收标准

### Phase 1 验收
- [ ] 侧边导航可正常切换页面
- [ ] 股票详情页信息密度提升 50%+
- [ ] K 线图支持多周期切换
- [ ] 移动端适配正常

### Phase 2 验收
- [ ] 支持查询任意时间段的历史日线
- [ ] Admin 后台显示数据同步状态
- [ ] 批量同步 Cron 正常运行

### Phase 3 验收
- [ ] AI 分析返回结构化结果
- [ ] DCF/CAPM 参数可一键从 AI 结果填充
- [ ] 分析结果缓存 24 小时不过期
