#!/usr/bin/env python3
"""
最后更新：2026.05.02
批量同步股票行业信息到本地/远程 D1 数据库

数据源：datacenter.eastmoney.com RPT_DMSK_FN_BALANCE（含 INDUSTRY_NAME）
每批 200 只股票，约 62 批即可覆盖全部 12286 只

用法：
  python3 sync_industry.py                  # 生成 SQL 文件
  python3 sync_industry.py --apply-local    # 直接写入本地 D1
  python3 sync_industry.py --dry-run        # 仅统计，不写文件
  python3 sync_industry.py --codes 300394,300502  # 仅指定股票
"""
import urllib.request
import urllib.parse
import json as _json
import ssl
import gzip
import time
import argparse
import subprocess
import os
import sys
from datetime import date

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

DC_URL = "https://datacenter.eastmoney.com/api/data/v1/get"
BATCH_SIZE = 200  # 每批查询数量
SLEEP_BETWEEN = 0.5  # 批次间隔（秒）


def fetch_industry_batch(codes: list[str]) -> dict[str, str]:
    """
    批量获取行业信息。
    codes: ["300394", "300502", ...]（6位代码，不含交易所后缀）
    返回 {"300394": "通信设备", ...}
    """
    if not codes:
        return {}
    filter_str = '(SECURITY_CODE in ("' + '","'.join(codes) + '"))'
    params = {
        "reportName": "RPT_DMSK_FN_BALANCE",
        "columns": "SECURITY_CODE,SECURITY_NAME_ABBR,INDUSTRY_NAME",
        "filter": filter_str,
        "pageNumber": "1",
        "pageSize": str(len(codes) + 10),  # 多取一点防截断
        "sortTypes": "-1",
        "sortColumns": "REPORT_DATE",
    }
    url = DC_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "Referer": "https://data.eastmoney.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Encoding": "gzip, deflate",
    })
    try:
        with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
            raw = r.read()
            try:
                content = gzip.decompress(raw)
            except Exception:
                content = raw
            d = _json.loads(content.decode("utf-8"))
        rows = (d.get("result") or {}).get("data") or []
        # 去重：同一只股票可能有多期数据，取第一条（最新）
        seen: dict[str, str] = {}
        for row in rows:
            code = str(row.get("SECURITY_CODE") or "").strip()
            industry = str(row.get("INDUSTRY_NAME") or "").strip()
            if code and code not in seen:
                seen[code] = industry
        return seen
    except Exception as e:
        print(f"  [ERROR] 请求失败: {e}")
        return {}


def get_symbols_from_local_d1(project_dir: str) -> list[tuple[str, str]]:
    """从本地 D1 获取所有股票 symbol 和 ts_code"""
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "yzinvest", "--local",
         "--command", "SELECT symbol, ts_code FROM stocks ORDER BY symbol;",
         "--json"],
        capture_output=True, text=True,
        cwd=os.path.join(project_dir, "apps/api")
    )
    if result.returncode != 0:
        print("获取股票列表失败:", result.stderr[:200])
        return []
    try:
        data = _json.loads(result.stdout)
        rows = data[0].get("results") or []
        return [(r["symbol"], r["ts_code"]) for r in rows if r.get("symbol")]
    except Exception as e:
        print("解析 D1 结果失败:", e)
        return []


def esc(s):
    if s is None or s == "":
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser(description="同步股票行业信息")
    parser.add_argument("--output", default="/tmp/sync_industry.sql", help="SQL 输出文件")
    parser.add_argument("--apply-local", action="store_true", help="生成 SQL 后直接写入本地 D1")
    parser.add_argument("--dry-run", action="store_true", help="仅统计不写文件")
    parser.add_argument("--codes", default="", help="仅同步指定股票，逗号分隔（6位代码）")
    parser.add_argument("--project-dir", default="/Users/leon.chen/work/ai-dev-projects/yzinvest-ai",
                        help="项目根目录")
    args = parser.parse_args()

    print(f"🏭 股票行业信息同步")
    print(f"   数据源: datacenter.eastmoney.com (RPT_DMSK_FN_BALANCE)")
    print(f"   批次大小: {BATCH_SIZE}")

    # 获取待同步的股票列表
    if args.codes:
        codes_input = [c.strip() for c in args.codes.split(",") if c.strip()]
        # 补全 ts_code（简单推断）
        symbols = []
        for code in codes_input:
            if code.startswith("6"):
                ts = f"{code}.SH"
            elif code.startswith(("4", "8", "9")):
                ts = f"{code}.BJ"
            else:
                ts = f"{code}.SZ"
            symbols.append((code, ts))
        print(f"   指定股票: {len(symbols)} 只")
    else:
        print(f"   从本地 D1 加载股票列表...")
        symbols = get_symbols_from_local_d1(args.project_dir)
        print(f"   共 {len(symbols)} 只股票")

    if not symbols:
        print("❌ 无股票数据，退出")
        sys.exit(1)

    # 批量查询行业
    all_industry: dict[str, str] = {}  # {symbol: industry}
    total_batches = (len(symbols) + BATCH_SIZE - 1) // BATCH_SIZE
    sym_list = [s[0] for s in symbols]  # 只传 6位代码

    for i in range(0, len(sym_list), BATCH_SIZE):
        batch = sym_list[i:i + BATCH_SIZE]
        batch_no = i // BATCH_SIZE + 1
        industry_map = fetch_industry_batch(batch)
        all_industry.update(industry_map)

        pct = min(100, batch_no * 100 // total_batches)
        bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
        print(f"  批次 {batch_no:3d}/{total_batches} [{bar}] {pct}% | "
              f"本批: {len(batch)} 只 → 获取 {len(industry_map)} 条")

        if i + BATCH_SIZE < len(sym_list):
            time.sleep(SLEEP_BETWEEN)

    # 统计
    found = sum(1 for s, _ in symbols if all_industry.get(s))
    not_found = len(symbols) - found
    print(f"\n📊 统计: 获取行业信息 {found}/{len(symbols)}，未找到 {not_found}")

    if args.dry_run:
        print("（dry-run 模式，不写入文件）")
        return

    # 生成 SQL
    sqls = []
    for symbol, ts_code in symbols:
        industry = all_industry.get(symbol, "")
        if industry:  # 只更新有行业信息的
            sqls.append(
                f"UPDATE stocks SET industry={esc(industry)}, updated_at=datetime('now') "
                f"WHERE ts_code={esc(ts_code)};"
            )

    print(f"\n📝 生成 UPDATE SQL: {len(sqls)} 条")

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(f"-- 股票行业信息同步 SQL\n")
        f.write(f"-- 生成时间: {date.today().isoformat()}\n")
        f.write(f"-- 更新数量: {len(sqls)}/{len(symbols)}\n")
        f.write(f"-- 数据源: datacenter.eastmoney.com RPT_DMSK_FN_BALANCE\n\n")
        for sql in sqls:
            f.write(sql + "\n")

    size_kb = os.path.getsize(args.output) / 1024
    print(f"✅ SQL 已保存: {args.output} ({size_kb:.0f} KB)")

    if args.apply_local:
        print(f"\n🚀 写入本地 D1...")
        api_dir = os.path.join(args.project_dir, "apps/api")

        # D1 每次 execute 有行数限制，分批执行
        chunk_size = 500
        success_chunks = 0
        for ci in range(0, len(sqls), chunk_size):
            chunk = sqls[ci:ci + chunk_size]
            sql_chunk = "\n".join(chunk)
            result = subprocess.run(
                ["npx", "wrangler", "d1", "execute", "yzinvest", "--local",
                 "--command", sql_chunk],
                capture_output=True, text=True, cwd=api_dir
            )
            if result.returncode == 0:
                success_chunks += 1
                print(f"  批次 {ci//chunk_size + 1}: ✅ {len(chunk)} 条")
            else:
                print(f"  批次 {ci//chunk_size + 1}: ❌ {result.stderr[:100]}")

        print(f"\n✅ 本地 D1 更新完成（{success_chunks} 批次）")

        # 验证
        verify = subprocess.run(
            ["npx", "wrangler", "d1", "execute", "yzinvest", "--local",
             "--command", "SELECT COUNT(*) as cnt FROM stocks WHERE industry IS NOT NULL AND industry != '';"],
            capture_output=True, text=True, cwd=api_dir
        )
        print("验证:", verify.stdout[-200:] if verify.stdout else verify.stderr[:100])


if __name__ == "__main__":
    main()
