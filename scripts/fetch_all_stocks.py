#!/usr/bin/env python3
"""
从东方财富API获取全量A股基础数据，生成SQL文件
市场覆盖：沪深主板 + 科创板 + 创业板 + 北交所（共约12000+条）
用法：python3 fetch_all_stocks.py [output_sql_path]
"""
import urllib.request
import json
import sys
import ssl
import time
from datetime import date

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

API_BASE = "https://push2delay.eastmoney.com/api/qt/clist/get"
UT = "bd1d9ddb04089700cf9c27f6f7426281"
# 全覆盖：沪深主板+科创板+创业板+北交所
FS_ALL = "m:0+t:6,m:0+t:13,m:0+t:80,m:0+t:81,m:1+t:2,m:1+t:23,m:1+t:80,m:0+t:82,m:1+t:82"
FIELDS = "f12,f14,f3,f4,f5,f6,f7,f15,f16,f17,f18,f20"

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
        return json.loads(resp.read().decode("utf-8"))

def esc(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("\\", "\\\\").replace("'", "''") + "'"

def gen_sql(items, today_str):
    stock_sqls = []
    daily_sqls = []
    skipped = 0
    for item in items:
        f12 = item.get("f12")
        f14 = item.get("f14")
        if not f12:
            skipped += 1
            continue
        is_bj = f12.startswith("4") or f12.startswith("8") or f12.startswith("9")
        exchange = "BJ" if is_bj else ("SH" if f12.startswith("6") else "SZ")
        ts_code = f"{f12}.{exchange}"
        stock_sqls.append(
            f"INSERT INTO stocks (ts_code,symbol,name,exchange,list_status,created_at,updated_at) "
            f"VALUES ({esc(ts_code)},{esc(f12)},{esc(f14)},{esc(exchange)},'L',datetime('now'),datetime('now')) "
            f"ON CONFLICT(ts_code) DO UPDATE SET name=excluded.name,symbol=excluded.symbol,updated_at=datetime('now');"
        )
        current = item.get("f4") or 0
        if current > 0:
            pct = item.get("f3") or 0
            pre_close = round(current / (1 + pct / 100), 4) if pct != 0 else current
            open_p   = round((item.get("f5") or 0) / 100, 2)
            high_p   = round((item.get("f6") or 0) / 100, 2)
            low_p    = round((item.get("f7") or 0) / 100, 2)
            vol      = item.get("f18") or 0
            amount   = item.get("f20") or 0
            change   = round(current - pre_close, 4)
            daily_sqls.append(
                f"INSERT INTO stock_daily (ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount,created_at) "
                f"VALUES ({esc(ts_code)},{esc(today_str)},{open_p},{high_p},{low_p},{current},{pre_close},{change},{pct},{vol},{amount},datetime('now')) "
                f"ON CONFLICT(ts_code,trade_date) DO UPDATE SET open=excluded.open,high=excluded.high,low=excluded.low,"
                f"close=excluded.close,pre_close=excluded.pre_close,change=excluded.change,pct_chg=excluded.pct_chg,"
                f"vol=excluded.vol,amount=excluded.amount;"
            )
    return stock_sqls, daily_sqls, skipped

def main():
    output = sys.argv[1] if len(sys.argv) > 1 else "/tmp/sync_stocks_full.sql"
    page_size = 100
    today_str = date.today().strftime("%Y%m%d")

    print(f"📡 获取全量A股数据...")
    print(f"   日期: {today_str} | 每页: {page_size}")

    # 获取总数
    data = fetch_page(1, page_size, FS_ALL)
    total_raw = (data.get("data") or {}).get("total") or 0
    total = int(total_raw) if str(total_raw).isdigit() else 0
    max_pages = (total // page_size) + 2
    print(f"   总计: {total} 条 | 预计页数: {max_pages}")

    all_stock_sqls = []
    all_daily_sqls = []
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
            consecutive_errors = 0
            s_sqls, d_sqls, skipped = gen_sql(items, today_str)
            all_stock_sqls.extend(s_sqls)
            all_daily_sqls.extend(d_sqls)
            total_int = total if isinstance(total, int) else int(total) if str(total).isdigit() else 1
            pct = min(100, page * page_size * 100 // total_int)
            bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
            print(f"  第 {page:3d} 页: {len(items):3d} 条 [{bar}] {pct}%")
            if page * page_size >= total:
                print("  ✅ 已获取全部数据")
                break
        except Exception as e:
            print(f"  第 {page} 页失败: {e}")
            consecutive_errors += 1
            if consecutive_errors >= 3:
                print("  连续失败3次，停止")
                break

    # 写 SQL 文件（无 BEGIN/COMMIT，D1 不支持）
    with open(output, "w", encoding="utf-8") as f:
        f.write(f"-- 全量A股基础数据 SQL\n")
        f.write(f"-- 生成时间: {date.today().isoformat()} {time.strftime('%H:%M:%S')}\n")
        f.write(f"-- 覆盖: 沪深主板 + 科创板 + 创业板 + 北交所\n")
        f.write(f"-- stocks={len(all_stock_sqls)}, daily={len(all_daily_sqls)}\n\n")
        for sql in all_stock_sqls:
            f.write(sql + "\n")
        f.write(f"\n-- === stock_daily ({today_str}) ===\n")
        for sql in all_daily_sqls:
            f.write(sql + "\n")

    size_kb = len(open(output, "rb").read()) / 1024
    print(f"\n✅ SQL 已生成: {output}")
    print(f"   大小: {size_kb:.0f} KB | stocks: {len(all_stock_sqls)} | daily: {len(all_daily_sqls)}")

if __name__ == "__main__":
    main()
