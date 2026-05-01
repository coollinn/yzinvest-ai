#!/usr/bin/env python3
"""
从东方财富API分页获取全量股票数据，生成SQL文件
用法：python3 sync_stocks_full.py [market]
market: HS=沪深A股(默认), KCB=科创板, CYB=创业板, SH=沪市, SZ=深市, BJ=北交所
"""
import urllib.request
import json
import sys
import ssl
import time
from datetime import date

# 禁用 SSL 证书验证
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

API_BASE = "https://push2delay.eastmoney.com/api/qt/clist/get"
UT = "bd1d9ddb04089700cf9c27f6f7426281"

# 板块参数映射
FS_MAP = {
    "HS":  "m:0+t:6,m:0+t:13,m:1+t:2,m:1+t:23",   # 沪深A股
    "KCB": "m:0+t:80,m:0+t:81,m:1+t:23,m:1+t:80", # 科创板
    "CYB": "m:0+t:80,m:1+t:80",                    # 创业板
    "SH":  "m:1+t:2,m:1+t:23,m:1+t:80",            # 沪市
    "SZ":  "m:0+t:6,m:0+t:13,m:0+t:80,m:0+t:81",   # 深市
    "BJ":  "m:0+t:82,m:1+t:82",                    # 北交所
}

# 字段: f12=代码, f14=名称, f3=涨跌幅, f4=最新价, f5=今开, f6=最高, f7=最低,
#       f15=今开, f16=昨收, f17=最高, f18=最低, f18=成交量, f20=成交额
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
    for item in items:
        f12 = item.get("f12")
        f14 = item.get("f14")
        if not f12:
            continue

        # 判断交易所
        is_bj = f12.startswith("4") or f12.startswith("8") or f12.startswith("9")
        exchange = "BJ" if is_bj else ("SH" if f12.startswith("6") else "SZ")
        ts_code = f"{f12}.{exchange}"

        # stocks upsert
        stock_sqls.append(
            f"INSERT INTO stocks (ts_code, symbol, name, exchange, list_status, created_at, updated_at) "
            f"VALUES ({esc(ts_code)}, {esc(f12)}, {esc(f14)}, {esc(exchange)}, 'L', datetime('now'), datetime('now')) "
            f"ON CONFLICT(ts_code) DO UPDATE SET name=excluded.name, symbol=excluded.symbol, updated_at=datetime('now');"
        )

        # stock_daily upsert
        current = item.get("f4") or 0
        if current > 0:
            pct = item.get("f3") or 0
            pre_close = round(current / (1 + pct / 100), 4) if pct != 0 else current
            open_p  = round((item.get("f5") or 0) / 100, 2)
            high_p  = round((item.get("f6") or 0) / 100, 2)
            low_p   = round((item.get("f7") or 0) / 100, 2)
            vol     = item.get("f18") or 0
            amount  = item.get("f20") or 0
            change  = round(current - pre_close, 4)

            daily_sqls.append(
                f"INSERT INTO stock_daily (ts_code, trade_date, open, high, low, close, pre_close, change, pct_chg, vol, amount, created_at) "
                f"VALUES ({esc(ts_code)}, {esc(today_str)}, {open_p}, {high_p}, {low_p}, {current}, {pre_close}, {change}, {pct}, {vol}, {amount}, datetime('now')) "
                f"ON CONFLICT(ts_code, trade_date) DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low, "
                f"close=excluded.close, pre_close=excluded.pre_close, change=excluded.change, pct_chg=excluded.pct_chg, "
                f"vol=excluded.vol, amount=excluded.amount;"
            )

    return stock_sqls, daily_sqls

def main():
    market = sys.argv[1].upper() if len(sys.argv) > 1 else "HS"
    fs = FS_MAP.get(market, FS_MAP["HS"])
    page_size = 100  # API最大返回100条

    today_str = date.today().strftime("%Y%m%d")
    print(f"市场={market} | 每页={page_size} | 日期={today_str}")
    print(f"板块参数: {fs}")

    # 先获取总数
    print("\n[1/3] 获取总数...")
    data = fetch_page(1, page_size, fs)
    total = (data.get("data") or {}).get("total") or 0
    print(f"      总计 {total} 条股票，预计需要 {total // page_size + 1} 页")

    if total == 0:
        print("❌ 没有数据，API可能不可用")
        return

    all_stock_sqls = []
    all_daily_sqls = []
    max_pages = (total // page_size) + 2  # 多取1页防止遗漏
    consecutive_empty = 0

    print(f"\n[2/3] 分页获取数据 (最多 {max_pages} 页)...")
    for page in range(1, max_pages + 1):
        try:
            if page > 1:
                time.sleep(0.3)  # 礼貌性延迟，避免高频
            data = fetch_page(page, page_size, fs)
            items = (data.get("data") or {}).get("diff") or []
            if not items:
                consecutive_empty += 1
                print(f"  第 {page} 页: 空，停止")
                break
            consecutive_empty = 0

            s_sqls, d_sqls = gen_sql(items, today_str)
            all_stock_sqls.extend(s_sqls)
            all_daily_sqls.extend(d_sqls)
            pct = min(100, page * page_size * 100 // total)
            bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
            print(f"  第 {page:2d} 页: {len(items)} 条 [{bar}] {pct}% ({page * page_size}/{total})")

            if page * page_size >= total:
                print("  ✅ 已获取全部数据")
                break
        except Exception as e:
            print(f"  第 {page} 页失败: {e}")
            consecutive_empty += 1
            if consecutive_empty >= 3:
                print("  连续失败3次，停止")
                break

    print(f"\n[3/3] 生成 SQL 文件...")
    sql_file = f"/tmp/sync_stocks_{market}_full.sql"
    with open(sql_file, "w", encoding="utf-8") as f:
        f.write(f"-- 全量股票数据同步 SQL\n")
        f.write(f"-- 市场: {market} | 生成时间: {date.today().isoformat()} {time.strftime('%H:%M:%S')}\n")
        f.write(f"-- 记录数: stocks={len(all_stock_sqls)}, daily={len(all_daily_sqls)}\n\n")
        f.write("BEGIN TRANSACTION;\n\n")
        f.write("-- === stocks 表 ===\n")
        for sql in all_stock_sqls:
            f.write(sql + "\n")
        f.write(f"\n-- === stock_daily 表 ({today_str}) ===\n")
        for sql in all_daily_sqls:
            f.write(sql + "\n")
        f.write("\nCOMMIT;\n")

    size = len(open(sql_file, "rb").read()) / 1024
    print(f"\n✅ SQL 文件已生成：{sql_file}")
    print(f"   大小: {size:.1f} KB")
    print(f"   stocks 记录: {len(all_stock_sqls)} 条")
    print(f"   stock_daily 记录: {len(all_daily_sqls)} 条")
    print(f"\n导入命令:")
    print(f"  本地: cd yzinvest-ai/apps/api && npx wrangler d1 execute yzinvest --local --file={sql_file}")
    print(f"  远程: cd yzinvest-ai/apps/api && npx wrangler d1 execute yzinvest --remote --file={sql_file}")

if __name__ == "__main__":
    main()
