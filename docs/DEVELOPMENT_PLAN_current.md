# YZInvest AI 当前开发计划

> 日期: 2026-05-02
> 状态: 进行中

---

## 任务1: 访客模式（非强制登录）✅ 已完成

**目标**: 网站不要求强制登录，未登录用户可浏览股票、看行情、看财务数据。收藏/笔记等功能在未登录时使用 localStorage 临时存储。

### 实施情况
- ✅ `routes/favorites.ts` / `routes/notes.ts` - 接口保持 requireAuth（登录才能持久化）
- ✅ `router/index.ts` - 移除 `/favorites` 和 `/notes` 的 requiresAuth
- ✅ `pages/Favorites.vue` - 已支持 localStorage 临时收藏
- ✅ `pages/Notes.vue` - 已支持 localStorage 临时笔记
- ✅ `pages/StockDetail.vue` - 收藏在未登录时使用 localStorage
- ✅ `composables/useLocalStorage.ts` - localStorage 数据封装
- ✅ `components/layout/Sidebar.vue` - 导航栏未登录也能看到

---

## 任务2: 用户设置 + 管理后台完善

### 2.1 用户设置（apps/web/src/pages/Settings.vue）
- [x] 修改密码（已有 `/auth/change-password`）
- [ ] 修改个人信息（昵称、邮箱）
- [ ] 后端 `PUT /auth/me` 接口

### 2.2 后端 admin 路由完善
- [ ] `GET /admin/users` 增加 `?q=keyword` 搜索（用户名/邮箱）
- [ ] `GET /admin/notes` 增加 `?q=` 搜索 + `?user_id=` 筛选
- [ ] `GET /admin/db/stocks` 增加 `?q=` 搜索（代码/名称/行业）
- [ ] `GET /admin/db/daily` 增加 `?q=` 筛选（已支持 ts_code）
- [ ] `GET /admin/favorites` - 列出所有用户的收藏
- [ ] `DELETE /admin/favorites/:id` - 删除收藏
- [ ] `DELETE /admin/db/daily` - 批量删除日线数据
- [ ] `POST /admin/refresh/quotes` - 强制刷新所有股票实时行情到数据库

### 2.3 前端 Admin.vue 重构（标签页）
- [ ] 重构为标签页：仪表盘 / 用户 / 笔记 / 收藏 / 股票 / 日K线
- [ ] 每个 tab 都包含：搜索框 + 列表 + 编辑/删除/重置密码按钮

---

## 任务3: 数据刷新 + AI 历史回测

### 3.1 数据 BUG 修复（重要！）
- [ ] **修复 fetchQuote 中 f43 / 100 的错误** — fltt=2 时 f43 已经是元，不应再除100
  - 实际验证：300394.SZ 当前价 307.5（API返回值），代码 /100 后变 3.075（错误）
  - 涉及字段：f43/f44/f48/f49/f50/f51/f52
- [ ] **修复财务指标 API** — 旧 `RPT_FCI_PCST` 已失效，改用新接口
  - 新接口：`https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_LICO_FN_CPD&sortColumns=REPORTDATE&source=HSF10`
  - 包含字段：BASIC_EPS / TOTAL_OPERATE_INCOME / PARENT_NETPROFIT / WEIGHTAVG_ROE / YSTZ / SJLTZ / BPS / XSMLL（毛利率）等
  - 验证：300394.SZ 已能正确返回 52 期数据

### 3.2 历史数据填充
- [ ] 用 `fetchKline` 拉取 300394.SZ 完整 3 年日K数据（约 750 条）
- [ ] 入库 stockDaily 表
- [ ] 提供后台 `POST /api/admin/sync/kline` 路由（指定 ts_code + 范围）
- [ ] 在股票详情页"K线"标签下显示完整历史数据

### 3.3 AI 价格预测模型
- [ ] 新增 `apps/api/src/services/prediction.ts` 服务
  - 输入：ts_code 历史日K
  - 算法：
    - MA 均线趋势（5/10/20/60 日）
    - 简单线性回归（最近 30 日）
    - 涨跌动量（RSI / 布林带宽度）
    - 综合得分 → 输出未来1周（5个交易日）每日预测价
  - 输出：5 天预测价 + 置信区间 + 多空信号 + 关键指标解读
- [ ] 新增表 `predictions`（缓存预测结果）
  - id / ts_code / model_version / horizon_days / predict_dates(json) / predict_prices(json) / confidence(real) / signal('bull'|'bear'|'neutral') / created_at
- [ ] 新增路由 `apps/api/src/routes/prediction.ts`
  - `GET /api/prediction/:ts_code/next-week` — 未来5日预测
  - `GET /api/prediction/:ts_code/backtest` — 历史回测（最近30/60天）
- [ ] 前端 `apps/web/src/components/stock/PredictionPanel.vue`
  - 折线图叠加历史K + 预测线（虚线）
  - 关键指标卡（多空信号 / 置信度 / 5日均价）
  - 历史回测准确率展示
- [ ] StockDetail.vue 增加"AI 预测"标签

### 3.4 测试标的
- 天孚通信 300394.SZ（验证当前价 307.50 元 / 财务数据可拉取 / 历史数据齐全）

---

## 任务4: 财务报表 PDF

### 4.1 数据源
- 巨潮 cninfo API：
  - 列表：`POST http://www.cninfo.com.cn/new/hisAnnouncement/query`
  - PDF URL: `http://static.cninfo.com.cn/{adjunctUrl}`
- 已验证 300394.SZ 返回 68 份历史报表（年报/半年报/季报）

### 4.2 数据库表
- [ ] 新增表 `financial_reports`
  ```sql
  id INTEGER PK, ts_code TEXT, announcement_id TEXT UNIQUE,
  title TEXT, report_type TEXT (年报|半年报|一季报|三季报|摘要),
  report_period TEXT (2025Q4 等), announcement_date TEXT,
  pdf_url TEXT, file_size INTEGER, created_at TEXT
  ```
- [ ] index: ts_code + report_period

### 4.3 后端 API
- [ ] `apps/api/src/services/cninfo-reports.ts` — 拉取报表元数据（不下载 PDF）
- [ ] `apps/api/src/routes/financial.ts` 新增：
  - `GET /api/financial/:ts_code/reports` — 报表列表（按期分组）
  - `POST /api/financial/:ts_code/reports/sync` — 同步报表元数据到数据库
  - PDF 通过外链直接展示，不存到 Cloudflare R2/KV（节省资源）

### 4.4 前端
- [ ] `apps/web/src/components/stock/ReportsPanel.vue`
  - 按报告期分组（年/半年/季）
  - 列表：标题 / 公告日 / 文件大小 / 下载按钮
  - "同步最新报告"按钮
- [ ] StockDetail.vue 增加"报告"标签

### 4.5 测试标的
- 天孚通信 300394.SZ（应能拉到 68 份报表，含 2026 一季报）

---

## 开发顺序与里程碑

### Phase A（数据修复，立即开始）
1. 修复 fetchQuote 价格 /100 bug
2. 修复财务指标 API（替换 RPT_FCI_PCST）
3. 验证 300394.SZ 数据正确

### Phase B（数据扩充）
4. 历史日K批量同步
5. 财务报表元数据同步（任务4）

### Phase C（AI 与展示）
6. AI 预测算法 + 路由
7. 财务报表前端 + 预测前端
8. StockDetail 增加两个标签

### Phase D（管理后台）
9. 用户设置-修改个人信息
10. 后台用户/笔记/收藏/股票管理
11. 后台数据库管理

---

## 关键文件清单

### 后端新增
- `apps/api/src/services/cninfo-reports.ts`
- `apps/api/src/services/prediction.ts`
- `apps/api/src/routes/prediction.ts`
- `apps/api/drizzle/migrations/0001_*.sql`（新表）

### 后端修改
- `apps/api/src/services/eastmoney.ts`（修复 bug）
- `apps/api/src/routes/financial.ts`（新增报表接口）
- `apps/api/src/routes/admin.ts`（搜索/收藏管理）
- `apps/api/src/routes/auth.ts`（新增 PUT /me）
- `apps/api/src/db/schema.ts`（新表）
- `apps/api/src/index.ts`（注册新路由）

### 前端新增
- `apps/web/src/components/stock/PredictionPanel.vue`
- `apps/web/src/components/stock/ReportsPanel.vue`
- `apps/web/src/components/admin/UserManager.vue`
- `apps/web/src/components/admin/NoteManager.vue`
- `apps/web/src/components/admin/FavoriteManager.vue`
- `apps/web/src/components/admin/StockManager.vue`
- `apps/web/src/components/admin/DailyManager.vue`

### 前端修改
- `apps/web/src/pages/Settings.vue`（修改个人信息）
- `apps/web/src/pages/Admin.vue`（重构标签页）
- `apps/web/src/pages/StockDetail.vue`（新增 prediction / reports 标签）
