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

## Phase 4: 估值模型增强 + 首页大盘 + 实时行情 ✅ 已完成

### 4.1 估值模型真实数据回填 ✅
- [x] `GET /api/valuation/:ts_code/params` — 从财务数据自动计算估值参数
  - 自由现金流 = 经营活动现金流净额（从现金流量表）
  - 增长率 = 近3年营收复合增长率（从利润表）
  - 贝塔系数 = 用历史日K线计算与上证指数的相关性
- [x] ValuationPanel.vue 新增"自动填充"按钮 + 数据来源提示
- [x] 新增关键财务指标参考卡（ROE/BPS/EPS/营收CAGR/经营现金流）

### 4.2 首页市场概览 ✅
- [x] Home.vue 展示主要指数实时行情（上证指数/深证成指/创业板指/科创50）
- [x] 新增涨幅榜/跌幅榜双栏展示
- [x] 移除"行情数据同步中"占位符

### 4.3 股票列表实时行情 ✅
- [x] Stocks.vue 接入东方财富批量实时行情 API（`/stocks/quotes`）
- [x] 表格新增列：最新价、涨跌幅、成交量、成交额、市值
- [x] 涨跌色（红涨绿跌）
- [x] 搜索模式同步显示行情

### 4.4 AI 智能研报（P2 - 待后续）
- [ ] `POST /api/prediction/:ts_code/report` — 接入 Claude API 生成智能研报
- [ ] PredictionPanel.vue 新增"AI 研报"卡片

---

## Phase 5: 体验优化 + 测试（后续）

- [ ] Playwright E2E 测试
- [ ] Lighthouse 性能优化
- [ ] 移动端响应式适配
- [ ] 价格预警系统（邮件/站内通知）
- [ ] 批量股票对比分析
- [ ] 行业板块涨跌热力图
- [ ] 财务指标趋势图（营收/利润/ROE 时间序列）

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
