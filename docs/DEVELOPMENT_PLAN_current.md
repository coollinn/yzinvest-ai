# YZInvest AI 当前开发计划

> 日期: 2026-05-03
> 状态: Phase 3 已完成并推送远端，Phase 4 进行中

---

## 已完成阶段

### Phase 1: 访客模式（非强制登录）✅
- 未登录可浏览股票、行情、财务数据
- 收藏/笔记使用 localStorage 临时存储

### Phase 2: 用户设置 + 管理后台 ✅
- Settings.vue: 修改密码 + 修改个人信息
- Admin.vue: 6个标签页（仪表盘/用户/笔记/收藏/股票/日K线）
- 搜索、分页、编辑、删除、重置密码

### Phase 3: 数据修复 + AI预测 + 财务报表 ✅
- 修复 fetchQuote 价格 /100 bug
- 替换失效的 RPT_FCI_PCST 财务指标 API
- 新增 HSF10 财务三表接口（利润表/资产负债表/现金流量表）
- 新增 AI 预测服务（MA/RSI/布林带/线性回归）
- 新增 /prediction/:ts_code/next-week 和 /backtest
- 新增 cninfo 财务报表 PDF 元数据同步
- StockDetail.vue 新增"AI预测"和"财务报表"标签
- 新增 predictions 和 financial_reports 表

---

## Phase 4: 估值模型增强 + 首页大盘 + 实时行情

### 4.1 估值模型真实数据回填（P0 - 用户明确需求）

**问题**: 当前 ValuationPanel.vue 的 DCF 参数全是 hardcoded：
- 自由现金流 = 10000 万元（硬编码）
- 增长率 = 10%（硬编码）
- 贝塔系数 = 1.2（硬编码）

**目标**: 从财务报表自动回填真实数据

#### 后端
- [ ] `GET /api/valuation/:ts_code/params` — 从财务数据计算估值参数
  - 自由现金流 = 经营活动现金流净额 - 资本支出（从现金流量表）
  - 增长率 = 近3年营收复合增长率（从利润表）
  - 贝塔系数 = 用历史日K线计算与大盘指数的相关性
  - 折现率 = 参考行业平均 WACC
  - 返回：`{ dcf_defaults: {...}, capm_defaults: {...}, data_source: "2025年报" }`

#### 前端
- [ ] ValuationPanel.vue 新增"自动填充"按钮
- [ ] 显示数据来源（如"基于2025年报数据"）
- [ ] 手动/自动模式切换

### 4.2 首页市场概览（P1）

**问题**: Home.vue "市场概览"区域完全是占位符（"行情数据同步中"）

**目标**: 展示真实的大盘指数、涨跌排行、行业热度

#### 后端
- [ ] `GET /api/stocks/indices` — 主要指数实时行情（已有，需增强缓存）
- [ ] `GET /api/stocks/leaders` — 涨跌排行
  - `?sort=pct_chg&order=desc&limit=10` — 涨幅前10
  - `?sort=pct_chg&order=asc&limit=10` — 跌幅前10
  - `?sort=amount&order=desc&limit=10` — 成交额前10
- [ ] `GET /api/stocks/industry-heatmap` — 行业板块涨跌热力图

#### 前端
- [ ] Home.vue 市场概览区域：
  - 4个主要指数卡片（上证指数/深证成指/创业板指/科创50）
  - 涨幅榜/跌幅榜/成交额榜 三栏
  - 行业板块涨跌排行

### 4.3 股票列表实时行情（P1）

**问题**: Stocks.vue 只有基础信息（代码/名称/行业），没有实时价格、涨跌幅

**目标**: 接入东方财富实时行情，显示价格/涨跌幅/成交量

#### 后端
- [ ] `GET /api/stocks/list` 已存在（东方财富实时行情），增强返回字段
- [ ] 或新增 `GET /api/stocks/quotes` 批量查询（已有， Stocks.vue 可直接用）

#### 前端
- [ ] Stocks.vue 表格增加列：最新价、涨跌幅、成交量、成交额、市值
- [ ] 支持点击表头排序（按涨跌幅/成交量/市值）
- [ ] 搜索时同步显示行情
- [ ] 涨跌色（红涨绿跌）

### 4.4 AI 智能研报（P2）

**目标**: 接入 Claude API，基于财务数据+历史数据生成自然语言分析

#### 后端
- [ ] `POST /api/prediction/:ts_code/report` — 生成智能研报
  - 输入：历史K线 + 财务指标 + 预测结果
  - 调用 Claude API 生成分析文本
  - 输出：投资要点 / 风险提示 / 财务健康度评估
  - KV 缓存 24h

#### 前端
- [ ] PredictionPanel.vue 新增"AI 研报"卡片
  - Markdown 格式展示分析文本
  - 关键结论高亮

---

## Phase 5: 体验优化 + 测试（后续）

- [ ] Playwright E2E 测试
- [ ] Lighthouse 性能优化
- [ ] 移动端响应式适配
- [ ] 价格预警系统（邮件/站内通知）
- [ ] 批量股票对比分析

---

## Phase 4 开发顺序

1. **4.1 估值模型回填** — 用户最明确的需求，相对独立
2. **4.3 股票列表实时行情** — 影响 Stocks.vue 核心体验
3. **4.2 首页市场概览** — 提升首页信息密度
4. **4.4 AI 智能研报** — 需要 Claude API key，可选

---

## 关键文件清单（Phase 4）

### 后端新增/修改
- `apps/api/src/routes/valuation.ts` — 新增自动参数计算接口
- `apps/api/src/routes/stocks.ts` — 增强 leaders / heatmap 接口
- `apps/api/src/services/prediction.ts` — 新增 Claude API 研报生成
- `apps/api/src/routes/prediction.ts` — 新增 report 路由

### 前端修改
- `apps/web/src/components/stock/ValuationPanel.vue` — 自动填充真实数据
- `apps/web/src/pages/Stocks.vue` — 实时行情列 + 排序
- `apps/web/src/pages/Home.vue` — 市场概览（指数/排行/板块）
- `apps/web/src/components/stock/PredictionPanel.vue` — AI研报展示
