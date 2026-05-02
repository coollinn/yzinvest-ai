#!/usr/bin/env python3
"""
最后更新：2026.05.02
从东方财富API获取A股数据，生成SQL和JSON备份文件
支持全量模式和增量模式（--date / --stocks-only）
市场覆盖：沪市主板 + 深市主板 + 科创板 + 创业板 + 北交所（约12386条）
含行业信息补充（通过 datacenter.eastmoney.com）

用法：
  python3 fetch_all_stocks.py /tmp/out.sql                    # 全量，今天行情
  python3 fetch_all_stocks.py /tmp/out.sql --date 20260501    # 指定日期行情
  python3 fetch_all_stocks.py /tmp/out.sql --stocks-only      # 仅股票基础信息
  python3 fetch_all_stocks.py /tmp/out.sql --json --backup-dir ./backups  # 同时生成 JSON 备份
  python3 fetch_all_stocks.py /tmp/out.sql --with-industry   # 补充行业信息（较慢）
"""
import urllib.request
import json as _json
import sys
import ssl
import time
import argparse
import os
import urllib.parse
from datetime import date, datetime

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# 行情接口（无行业字段）
API_BASE = "https://push2delay.eastmoney.com/api/qt/clist/get"
# 股票基础信息接口（含行业）
DC_BASE = "https://datacenter.eastmoney.com/api/data/v1/get"
UT = "bd1d9ddb04089700cf9c27f6f7426281"

# 市场参数（对照 eastmoney.ts MARKET_CODES，覆盖全A股）
FS_ALL = "m:1+t:23,m:1+t:80,m:0+t:80,m:0+t:81,m:1+t:2,m:1+t:23,m:0+t:82,m:1+t:82"
# 说明：
#   m:1+t:23 = 沪市主板+科创板
#   m:1+t:80 = 沪市A股
#   m:0+t:80 = 深市主板
#   m:0+t:81 = 深市A股
#   m:1+t:2  = 深市A股（另一分类）
#   m:0+t:82,m:1+t:82 = 北交所
# 注：东方财富 fs 参数中 m:0=深市，m:1=沪市；t:23=科创板，t:80=主板，t:81/82=创业板/北交所

FIELDS = "f12,f14,f3,f4,f5,f6,f7,f15,f16,f17,f18,f20"

# ---------------------------------------------------------------------------
# 行情数据获取
# ---------------------------------------------------------------------------

def fetch_page(page, page_size, fs):
    params = [
        f"pn={page}", f"pz={page_size}", "po=1", "np=1",
        f"ut={UT}", "fltt=2", "invt=2", "fid=f3",
        f"fs={fs}", f"fields={FIELDS}"
    ]
    url = f"{API_BASE}?{'&'.join(params)}"
    req = urllib.request.Request(url, headers={
        "Referer": "https://finance.eastmoney.com/",
        "User-Agent": "Mozilla/5.0"
    })
    with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
        return _json.loads(resp.read().decode("utf-8"))

# ---------------------------------------------------------------------------
# 行业信息获取（datacenter.eastmoney.com）
# ---------------------------------------------------------------------------

def fetch_industry_map(ts_codes):
    """
    批量获取股票行业信息。
    通过 datacenter.eastmoney.com RPT_STOCK_BASICINFO 接口获取。
    返回 {ts_code: industry_name} 字典。
    ts_codes: list of "600519.SH" format codes
    """
    if not ts_codes:
        return {}

    # 分批处理，每批 200 个代码
    result = {}
    batch_size = 200

    for i in range(0, len(ts_codes), batch_size):
        batch = ts_codes[i:i+batch_size]
        # 构造 filter 条件：(SECURITY_CODE in ("600519.SH","000001.SZ"))
        codes_str = ",".join([f'"{c}"' for c in batch])
        filter_str = f"(SECURITY_CODE in ({codes_str}))"
        params = {
            "reportName": "RPT_STOCK_BASICINFO",
            "columns": "SECURITY_CODE,INDUSTRY_NAME",
            "filter": filter_str,
            "pageNumber": "1",
            "pageSize": str(len(batch)),
            "sortTypes": "-1",
            "sortColumns": "SECURITY_CODE",
        }
        query = urllib.parse.urlencode(params)
        url = f"{DC_BASE}?{query}"
        try:
            req = urllib.request.Request(url, headers={
                "Referer": "https://data.eastmoney.com/",
                "User-Agent": "Mozilla/5.0"
            })
            with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                data = _json.loads(resp.read().decode("utf-8"))
            rows = (data.get("result") or {}).get("data") or []
            for row in rows:
                code = row.get("SECURITY_CODE") or ""
                industry = row.get("INDUSTRY_NAME") or ""
                if code:
                    result[code] = industry
        except Exception as e:
            print(f"  [行业] 批次 {i//batch_size+1} 失败: {e}")
        time.sleep(0.3)

    return result

# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

def esc(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("\\", "\\\\").replace("'", "''") + "'"

def safe_float(val, default=0.0):
    """安全转换为浮点数，兼容 '-' 等非数字字符串"""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        val = val.strip()
        if val in ("", "-", "nan", "None"):
            return default
        try:
            return float(val)
        except (ValueError, TypeError):
            return default
    return default

def gen_sql(items, today_str, mode="all", industry_map=None):
    """
    生成 SQL 语句，同时收集用于 JSON 备份的原始数据
    mode=all:     stocks + stock_daily（今天）
    mode=stocks:  仅 stocks（无行情，用于 Layer 1 快速同步）
    industry_map: {ts_code: industry_name} 字典
    """
    stock_sqls = []
    daily_sqls = []
    raw_stocks = []   # JSON 备份用
    raw_dailys = []
    skipped = 0
    for item in items:
        f12 = item.get("f12")
        f14 = item.get("f14")
        if not f12:
            skipped += 1
            continue
        is_bj = str(f12).startswith(("4", "8", "9"))
        exchange = "BJ" if is_bj else ("SH" if str(f12).startswith("6") else "SZ")
        ts_code = f"{f12}.{exchange}"

        # 行业信息
        industry = (industry_map or {}).get(ts_code, "")

        stock_sqls.append(
            f"INSERT INTO stocks (ts_code,symbol,name,exchange,industry,list_status,created_at,updated_at) "
            f"VALUES ({esc(ts_code)},{esc(f12)},{esc(f14)},{esc(exchange)},{esc(industry)},'L',datetime('now'),datetime('now')) "
            f"ON CONFLICT(ts_code) DO UPDATE SET name=excluded.name,symbol=excluded.symbol,industry=excluded.industry,updated_at=datetime('now');"
        )
        raw_stocks.append({
            "ts_code": ts_code, "symbol": str(f12), "name": str(f14 or ""),
            "exchange": exchange, "industry": industry, "list_status": "L"
        })
        # 仅在需要行情数据时生成 stock_daily SQL
        if mode != "stocks":
            current = safe_float(item.get("f4"))
            if current > 0:
                pct     = safe_float(item.get("f3"))
                pre_close = round(current / (1 + pct / 100), 4) if pct != 0 else current
                open_p  = round(safe_float(item.get("f5")) / 100, 2)
                high_p  = round(safe_float(item.get("f6")) / 100, 2)
                low_p   = round(safe_float(item.get("f7")) / 100, 2)
                vol     = int(safe_float(item.get("f18")))
                amount  = int(safe_float(item.get("f20")))
                change  = round(current - pre_close, 4)
                daily_sqls.append(
                    f"INSERT INTO stock_daily (ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount,created_at) "
                    f"VALUES ({esc(ts_code)},{esc(today_str)},{open_p},{high_p},{low_p},{current},{pre_close},{change},{pct},{vol},{amount},datetime('now')) "
                    f"ON CONFLICT(ts_code,trade_date) DO UPDATE SET open=excluded.open,high=excluded.high,low=excluded.low,"
                    f"close=excluded.close,pre_close=excluded.pre_close,change=excluded.change,pct_chg=excluded.pct_chg,"
                    f"vol=excluded.vol,amount=excluded.amount;"
                )
                raw_dailys.append({
                    "ts_code": ts_code, "trade_date": today_str,
                    "open": open_p, "high": high_p, "low": low_p, "close": current,
                    "pre_close": pre_close, "change": change, "pct_chg": pct,
                    "vol": vol, "amount": amount
                })
    return stock_sqls, daily_sqls, raw_stocks, raw_dailys, skipped

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="东方财富A股数据获取（含行业信息）")
    parser.add_argument("output", nargs="?", default="/tmp/sync_stocks_full.sql")
    parser.add_argument("--date", dest="trade_date", default=None,
                        help="行情日期，如 20260501（默认今天）")
    parser.add_argument("--stocks-only", action="store_true",
                        help="仅获取股票基础信息，不含今日行情")
    parser.add_argument("--page-size", type=int, default=100,
                        help="每页条数（默认100，最大100）")
    parser.add_argument("--json", action="store_true",
                        help="同时生成 JSON 备份文件")
    parser.add_argument("--backup-dir", default="/Users/leon.chen/WorkBuddy/20260426212833/data_backup",
                        help="JSON 备份目录（默认 WorkBuddy data_backup）")
    parser.add_argument("--with-industry", action="store_true",
                        help="补充行业信息（需要额外 API 调用，较慢）")
    args = parser.parse_args()

    today_str = args.trade_date or date.today().strftime("%Y%m%d")
    mode = "stocks" if args.stocks_only else "all"
    page_size = min(args.page_size, 100)

    mode_desc = "仅股票基础信息" if mode == "stocks" else f"股票+行情({today_str})"
    print(f"📡 获取A股数据（模式: {mode_desc}）...")
    print(f"   每页: {page_size} 条")
    if args.with_industry:
        print(f"   ⚡ 行业信息补充: 开启（将额外调用 datacenter API）")

    # 获取总数
    data = fetch_page(1, page_size, FS_ALL)
    total_raw = (data.get("data") or {}).get("total") or 0
    total = int(total_raw) if str(total_raw).isdigit() else 0
    max_pages = (total // page_size) + 2
    print(f"   总计: {total} 条 | 预计页数: ~{max_pages}")

    all_stock_sqls = []
    all_daily_sqls = []
    all_raw_stocks = []
    all_raw_dailys = []
    all_ts_codes = []   # 用于行业查询
    consecutive_errors = 0

    for page in range(1, max_pages + 1):
        try:
            if page > 1:
                time.sleep(0.3)
            data = fetch_page(page, page_size, FS_ALL)
            items = (data.get("data") or {}).get("diff") or []
            if not items:
                print(f"  第 {page} 页: 空，停止")
                break

            # 收集 ts_code 用于行业查询
            for item in items:
                f12 = item.get("f12")
                if f12:
                    is_bj = str(f12).startswith(("4", "8", "9"))
                    exchange = "BJ" if is_bj else ("SH" if str(f12).startswith("6") else "SZ")
                    all_ts_codes.append(f"{f12}.{exchange}")

            # 首次请求时用实际 total 修正
            if page == 1 and total == 0:
                raw = (data.get("data") or {}).get("total")
                if str(raw).isdigit():
                    total = int(raw)
                    max_pages = (total // page_size) + 2
                    print(f"   [修正] 总计: {total} 条 | 预计页数: ~{max_pages}")

            consecutive_errors = 0
            s_sqls, d_sqls, raw_s, raw_d, skipped = gen_sql(items, today_str, mode=mode)
            all_stock_sqls.extend(s_sqls)
            all_daily_sqls.extend(d_sqls)
            all_raw_stocks.extend(raw_s)
            all_raw_dailys.extend(raw_d)
            total_int = int(total) if isinstance(total, (int, float)) and int(total) > 0 else page * page_size
            pct = min(100, page * page_size * 100 // total_int) if total_int > 0 else 100
            bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
            print(f"  第 {page:3d} 页: {len(items):3d} 条 [{bar}] {pct}%")

            if int(total) > 0 and page * page_size >= int(total):
                print("  ✅ 已获取全部数据")
                break
        except Exception as e:
            print(f"  第 {page} 页失败: {e}")
            if "timed out" in str(e).lower() or "ssl" in str(e).lower():
                time.sleep(1)
                consecutive_errors -= 1
            consecutive_errors += 1
            if consecutive_errors >= 5:
                print("  连续失败5次，停止（剩余数据可在下次补全）")
                break

    # 补充行业信息
    industry_map = {}
    if args.with_industry and all_ts_codes:
        print(f"\n📡 补充行业信息（{len(all_ts_codes)} 只股票）...")
        industry_map = fetch_industry_map(all_ts_codes)
        print(f"   ✅ 获取到 {len(industry_map)} 条行业信息")

        # 更新 all_raw_stocks 中的行业字段
        for rs in all_raw_stocks:
            rs["industry"] = industry_map.get(rs["ts_code"], "")

        # 重新生成 stock_sqls（含行业）
        print("   重新生成 SQL（含行业）...")
        all_stock_sqls = []
        for rs in all_raw_stocks:
            ts = rs["ts_code"]
            sym = rs["symbol"]
            nm = rs["name"]
            ex = rs["exchange"]
            ind = rs.get("industry", "")
            all_stock_sqls.append(
                f"INSERT INTO stocks (ts_code,symbol,name,exchange,industry,list_status,created_at,updated_at) "
                f"VALUES ({esc(ts)},{esc(sym)},{esc(nm)},{esc(ex)},{esc(ind)},'L',datetime('now'),datetime('now')) "
                f"ON CONFLICT(ts_code) DO UPDATE SET name=excluded.name,symbol=excluded.symbol,industry=excluded.industry,updated_at=datetime('now');"
            )

    # 写 SQL
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(f"-- A股数据 SQL\n")
        f.write(f"-- 时间: {date.today().isoformat()} {time.strftime('%H:%M:%S')}\n")
        f.write(f"-- 模式: {mode} | 日期: {today_str}\n")
        f.write(f"-- stocks={len(all_stock_sqls)}, daily={len(all_daily_sqls)}\n\n")
        for sql in all_stock_sqls:
            f.write(sql + "\n")
        if all_daily_sqls:
            f.write(f"\n-- === stock_daily ({today_str}) ===\n")
            for sql in all_daily_sqls:
                f.write(sql + "\n")

    size_kb = len(open(args.output, "rb").read()) / 1024
    changed = len(all_stock_sqls)
    print(f"\n✅ SQL 已生成: {args.output}")
    print(f"   大小: {size_kb:.0f} KB | changed={changed}, daily={len(all_daily_sqls)}")

    # JSON 备份
    if args.json:
        now_ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = os.path.expanduser(args.backup_dir)

        # 去重（按 ts_code 取最新一条）
        seen_stocks = {}
        for s in all_raw_stocks:
            seen_stocks[s["ts_code"]] = s
        unique_stocks = list(seen_stocks.values())

        # stocks JSON
        os.makedirs(backup_dir, exist_ok=True)
        stocks_path = os.path.join(backup_dir, f"stocks_{today_str}_{now_ts}.json")
        with open(stocks_path, "w", encoding="utf-8") as f:
            _json.dump({
                "version": "1.0",
                "generated_at": f"{date.today().isoformat()} {time.strftime('%H:%M:%S')}",
                "trade_date": today_str,
                "mode": mode,
                "record_count": len(unique_stocks),
                "stocks": unique_stocks
            }, f, ensure_ascii=False, indent=2)
        print(f"📦 stocks JSON 备份: {stocks_path} ({len(unique_stocks)} 条)")

        # stock_daily JSON
        if all_raw_dailys:
            seen_daily = {}
            for d in all_raw_dailys:
                seen_daily[d["ts_code"]] = d
            unique_dailys = list(seen_daily.values())
            daily_path = os.path.join(backup_dir, f"stock_daily_{today_str}_{now_ts}.json")
            with open(daily_path, "w", encoding="utf-8") as f:
                _json.dump({
                    "version": "1.0",
                    "generated_at": f"{date.today().isoformat()} {time.strftime('%H:%M:%S')}",
                    "trade_date": today_str,
                    "record_count": len(unique_dailys),
                    "stock_daily": unique_dailys
                }, f, ensure_ascii=False, indent=2)
            print(f"📦 stock_daily JSON 备份: {daily_path} ({len(unique_dailys)} 条)")

if __name__ == "__main__":
    main()
