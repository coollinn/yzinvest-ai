# YZInvest AI — 数据同步操作手册

> 最后更新：2026.05.01
> 本手册记录 Layer 1（股票基础信息）和 Layer 2（行情数据）的全自动化同步流程。
> 适用于：新装部署、断点续传、定期维护。

---

## 一、文件说明

| 文件 | 用途 |
|:---|:---|
| `scripts/sync_all.sh` | **一键同步**：自动执行 fetch + 清理 + 分批导入（本地+远程） |
| `scripts/sync_incremental.sh` | **增量同步**：智能检测差异，每日维护首选 |
| `scripts/sync_resume.sh` | **断点续传**：从中断页面继续，只补漏不重复 |
| `scripts/fetch_all_stocks.py` | Python 数据获取脚本（东方财富 API） |
| `scripts/manage.sh` | 项目管理入口 |
| `data_backup/` | JSON 备份目录，每次同步自动保存一份 |

## 一.2 JSON 备份

每次同步会自动将数据保存为 JSON 文件，存放于：

```
/Users/leon.chen/WorkBuddy/20260426212833/data_backup/
```

**命名规则**：
```
stocks_{YYYYMMDD}_{HHMMSS}.json          # 股票基础信息备份
stock_daily_{YYYYMMDD}_{HHMMSS}.json     # 行情数据备份
```

**JSON 结构示例**：
```json
{
  "version": "1.0",
  "generated_at": "2026-05-01 21:30:00",
  "trade_date": "20260501",
  "record_count": 12286,
  "stocks": [
    {
      "ts_code": "600519.SH",
      "symbol": "600519",
      "name": "贵州茅台",
      "exchange": "SH",
      "list_status": "L"
    }
  ]
}
```

> **用途**：D1 数据损坏时可从 JSON 备份还原；JSON 也可独立用于其他分析场景。

---

## 二、同步模式

### 模式 A：首次同步 / 全量重刷（sync_all.sh）

适用于：新环境部署、远程数据损坏、发现历史缺失。

```
用户执行
    │
    ▼
sync_all.sh
    │
    ├─ 停止 wrangler dev（释放本地 D1 文件锁）
    ├─ 删除旧本地 D1 数据
    ├─ 执行 migrations apply（重建表结构）
    ├─ 运行 fetch_all_stocks.py → /tmp/stocks_full.sql
    ├─ 移除 BEGIN/COMMIT（兼容 D1）
    ├─ 分批（100条/批）导入本地 D1
    ├─ 代理检测 → 远程 D1 清空旧数据
    ├─ 分批导入远程 D1
    └─ 对比两边记录数，确认一致
```

**执行命令**：
```bash
cd ~/work/ai-dev-projects/yzinvest-ai
./scripts/sync_all.sh
```

脚本会自动完成以下所有步骤，无需人工干预：
1. 停止本地 wrangler dev（避免文件锁）
2. 重置本地 D1（删表重建）
3. 调用 Python 脚本获取全量数据（12386 条，~124 页）
4. 清理 SQL 文件（BEGIN/COMMIT 移除）
5. 分批导入本地 D1（100 条/批）
6. 检测代理，远程 D1 同样清空+导入
7. 对比两边数据量，确认一致

---

### 模式 B：断点续传（sync_resume.sh）

适用于：上次全量同步因网络抖动中断，缺失约 100 条记录。

**背景**：上次 fetch 在第 56 页左右中断，丢失了 ~100 条记录。
`fetch_all_stocks.py` 每次运行都从第 1 页重新拉，**不会**重复插入（ON CONFLICT 覆盖）。
所以直接运行 `sync_all.sh` 即可补全，效率低但安全。

**如果想更快恢复**，使用断点续传模式：
```bash
./scripts/sync_resume.sh
```
脚本会检测已有记录数，智能判断从哪页继续。

---

### 模式 C：每日增量同步（sync_incremental.sh）

适用于：日常维护，每次只同步变化部分（新增股票 + 当日行情）。

```bash
cd ~/work/ai-dev-projects/yzinvest-ai
./scripts/sync_incremental.sh           # 今日增量（推荐每日运行）
./scripts/sync_incremental.sh --date 20260501  # 指定日期行情
./scripts/sync_incremental.sh --stocks-only     # 仅 Layer 1（股票基础信息）
./scripts/sync_incremental.sh --dry-run         # 预览模式（不写入）
```

**自动化程度**：全自动，无需人工干预（分析差异 → 选择性拉取 → 分批导入 → 校验）。

**智能判断逻辑**：
1. Layer 1：每次全量拉取，但 `ON CONFLICT` 自动覆盖已有记录（无重复风险）
2. Layer 2：检查目标日期是否已存在记录，存在则跳过，不重复写入

---

## 三、东方财富 API 说明

### API 地址
```
https://push2delay.eastmoney.com/api/qt/clist/get
```

### FS 参数（全量覆盖）
```python
FS_ALL = "m:0+t:6,m:0+t:13,m:0+t:80,m:0+t:81,m:1+t:2,m:1+t:23,m:1+t:80,m:0+t:82,m:1+t:82"
```
覆盖：沪深主板 + 科创板 + 创业板 + 北交所 ≈ 12386 条

### 关键字段映射

| API字段 | 说明 | 存入字段 | 单位转换 |
|:---|:---|:---|:---|
| f12 | 股票代码 | symbol / ts_code | → ts_code 格式 `000001.SZ` |
| f14 | 股票名称 | name | - |
| f4 | 当前价 | close | 除以 100（分→元） |
| f5 | 开盘价 | open | 除以 100 |
| f6 | 最高价 | high | 除以 100 |
| f7 | 最低价 | low | 除以 100 |
| f3 | 涨跌幅% | pct_chg | 直接使用（%） |
| f18 | 成交量 | vol | 手（整数） |
| f20 | 成交额 | amount | 元（整数） |

**ts_code 转换规则**：
- `6` 开头 → SH（上交所）
- `0`/`3` 开头 → SZ（深交所）
- `4`/`8`/`9` 开头 → BJ（北交所）

### 已知限制

1. **停牌股票**：API 返回 `f4 = '-'`（字符串），不是数字。本脚本使用 `safe_float()` 兼容此情况。
2. **每页上限**：100 条（pz 参数设为 200 会被 API 忽略）
3. **total 字段类型**：`total` 有时返回字符串（如 `"12386"`）而非整数，本脚本做了兼容性处理。

---

## 四、D1 数据库操作约束

1. **不支持事务语句**：SQL 文件中的 `BEGIN TRANSACTION` 和 `COMMIT` 必须在导入前移除。
2. **每批限制**：D1 单次执行建议不超过 100 条语句（分批导入脚本自动处理）。
3. **本地文件锁**：运行 `wrangler dev` 时本地 D1 被锁定，`sync_all.sh` 会自动停止。
4. **远程操作需要代理**：访问 `workers.dev` 需要代理，脚本会自动检测并报错。

---

## 五、预期结果

### 成功标志

```bash
✅ 本地导入完成: 124 成功, 0 失败
✅ 远程导入完成: 124 成功, 0 失败

【数据校验】
本地 D1 → stocks: 12286 | stock_daily: 3275
远程 D1 → stocks: 12286 | stock_daily: 3275

✅ 两边数据量一致（正常差异：daily 条数因交易日不同可能略有不同）
```

### 常见错误处理

| 错误 | 原因 | 处理方式 |
|:---|:---|:---|
| `TypeError: '>' not supported` | 东方财富 API 返回 `'-'` 作为价格字段 | 已在 `fetch_all_stocks.py` 中修复，`safe_float()` 兼容 |
| `wrangler d1 execute: file not found` | SQL 文件路径不存在 | 检查 Python 脚本是否正常运行，文件是否写入成功 |
| `remote: unauthorized` | 代理未开启 | 开启代理后重试 |
| `port 8787 already in use` | wrangler dev 还在运行 | `lsof -i :8787`，kill 掉旧进程 |
| `total=0，空页提前停止` | API 返回 0 总数 | 已在脚本中用 fallback 空页检测逻辑处理 |

---

## 六、定期维护计划

| 任务 | 频率 | 命令 |
|:---|:---|:---|
| Layer 1 + 2 每日增量 | 每日收盘后（16:30） | `./scripts/sync_incremental.sh` |
| Layer 1 全量重刷 | 每季度一次，或发现缺失时 | `./scripts/sync_all.sh` |
| 断点续传 | 上次中断后 | `./scripts/sync_resume.sh` |
| 数据库状态检查 | 每周一次 | `./scripts/manage.sh db-status` |
| 数据量校验 | 每月一次 | 对比本地/远程 stocks 条数 |

> **JSON 备份**：每次同步（sync_all / sync_incremental）都会自动保存 JSON 备份到 `data_backup/` 目录，无需手动操作。

---

## 七、踩坑记录（更新后填写）

> 下次遇到同样情况时在此记录。

| 时间 | 场景 | 问题 | 解决方案 |
|:---|:---|:---|:---|
| 2026.05.01 | fetch_all_stocks.py 第 33-97 页 | 东方财富 API 返回 `f4='-'`（停牌股），`'-' > 0` 导致 TypeError | 添加 `safe_float()` 函数，字符串 `'-'` 转换为 `0.0` 再比较 |
| 2026.05.01 | 远程 D1 操作 | 代理未开启导致访问 workers.dev 失败 | manage.sh 已内置代理检测；sync_all.sh 也已继承此逻辑 |

---

*最后更新：2026.05.01*