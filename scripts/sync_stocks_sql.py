#!/usr/bin/env python3
"""
最后更新：2026.05.01
从东方财富API获取股票数据，生成 SQL 文件，可直接用 wrangler d1 execute 导入 D1 数据库
用法：python3 sync_stocks_sql.py [page_size=100] [max_pages=3] [market=HS]
"""

import urllib.request
import json
import sys
import ssl
from datetime import date

# 禁用 SSL 证书验证（macOS Python 常见问题）
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

API_BASE = "https://push2delay.eastmoney.com/api/qt/clist/get"
UT = "bd1d9ddb04089700cf9c27f6f7426281"

FS_MAP = {
    "SH": "m:1+t:23,m:1+t:80",
    "SZ": "m:0+t:80,m:0+t:81",
    "BJ": "m:0+t:82,m:1+t:82",
    "HS": "m:0+t:80,m:0+t:81,m:1+t:23,m:1+t:80",
    "ZT": "m:0+t:80,m:0+t:81,m:1+t:23,m:1+t:80+f:!ST,f:!*",
}

FIELDS = "f12,f14,f3,f4,f5,f6,f7,f15,f16,f17,f18,f20"

def fetch_page(page, page_size, market):
    fs = FS_MAP.get(market, FS_MAP["HS"])
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
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        return json.loads(resp.read().decode("utf-8"))

def esc(s):
    if s is None:
        return "NULL"
    return "'" + s.replace("\\", "\\\\").replace("'", "''") + "'"

def gen_sql(items, today_str):
    stock_sqls = []
    daily_sqls = []

    for item in items:
        f12 = item.get("f12")
        f14 = item.get("f14")
        if not f12:
            continue

        is_bj = f12.startswith("4") or f12.startswith("8") or f12.startswith("9")
        exchange = "BJ" if is_bj else ("SH" if f12.startswith("6") else "SZ")
        ts_code = f"{f12}.{exchange}"

        # stocks upsert
        stock_sqls.append(f"""
          INSERT INTO stocks (ts_code, symbol, name, exchange, list_status, created_at, updated_at)
          VALUES ({esc(ts_code)}, {esc(f12)}, {esc(f14)}, {esc(exchange)}, 'L', datetime('now'), datetime('now'))
          ON CONFLICT(ts_code) DO UPDATE SET
            name=excluded.name, symbol=excluded.symbol, updated_at=datetime('now');
        """)

        # stock_daily upsert
        current = item.get("f4") or 0
        if current > 0:
            pct = item.get("f3") or 0
            pre_close = current / (1 + pct / 100) if pct != 0 else current
            open_p = (item.get("f5") or 0) / 100
            high_p = (item.get("f6") or 0) / 10000
            low_p = (item.get("f7") or 0) / 100
            vol = item.get("f18") or 0
            amount = item.get("f20") or 0

            daily_sqls.append(f"""
              INSERT INTO stock_daily (ts_code, trade_date, open, high, low, close, pre_close, change, pct_chg, vol, amount, created_at)
              VALUES ({esc(ts_code)}, {esc(today_str)},
                {open_p}, {high_p}, {low_p}, {current}, {pre_close:.4f},
                {current - pre_close:.4f}, {pct},
                {vol}, {amount}, datetime('now'))
              ON CONFLICT(ts_code, trade_date) DO UPDATE SET
                open=excluded.open, high=excluded.high, low=excluded.low,
                close=excluded.close, pre_close=excluded.pre_close,
                change=excluded.change, pct_chg=excluded.pct_chg,
                vol=excluded.vol, amount=excluded.amount;
            """)

    return stock_sqls, daily_sqls

def main():
    page_size = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    market = sys.argv[3] if len(sys.argv) > 3 else "HS"

    today_str = date.today().strftime("%Y%m%d")
    print(f"市场={market}, 每页={page_size}, 页数={max_pages}, 日期={today_str}")

    all_stock_sqls = []
    all_daily_sqls = []

    for page in range(1, max_pages + 1):
        print(f"  获取第 {page}/{max_pages} 页...", end="", flush=True)
        try:
            data = fetch_page(page, page_size, market)
            items = (data.get("data") or {}).get("diff") or []
            total = (data.get("data") or {}).get("total") or 0
            print(f" OK ({len(items)} 条，总计 {total})")
            if not items:
                break

            s_sqls, d_sqls = gen_sql(items, today_str)
            all_stock_sqls.extend(s_sqls)
            all_daily_sqls.extend(d_sqls)
            print(f"    生成 SQL: stocks={len(s_sqls)}, daily={len(d_sqls)}")

            if page * page_size >= total:
                print("  已获取全部数据")
                break
        except Exception as e:
            print(f" 失败: {e}")
            if page == 1:
                raise
            break

    # 写入 SQL 文件
    sql_file = f"/tmp/sync_stocks_{market}.sql"
    with open(sql_file, "w", encoding="utf-8") as f:
        f.write("-- 股票数据同步 SQL\n")
        f.write(f"-- 生成时间: {date.today().isoformat()}\n\n")
        f.write("BEGIN TRANSACTION;\n\n")
        f.write("-- === stocks 表 ===\n")
        for sql in all_stock_sqls:
            f.write(sql)
            f.write("\n")
        f.write(f"\n-- === stock_daily 表 ({today_str}) ===\n")
        for sql in all_daily_sqls:
            f.write(sql)
            f.write("\n")
        f.write("\nCOMMIT;\n")

    print(f"\n✅ SQL 文件已生成：{sql_file}")
    print(f"   stocks 记录：{len(all_stock_sqls)} 条")
    print(f"   stock_daily 记录：{len(all_daily_sqls)} 条")
    print(f"\n执行导入命令：")
    print(f"  cd /Users/leon.chen/work/ai-dev-projects/yzinvest-ai/apps/api")
    print(f"  npx wrangler d1 execute yzinvest --local --file={sql_file}")

if __name__ == "__main__":
    main()
