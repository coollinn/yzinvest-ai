#!/usr/bin/env python3
"""最后更新：2026.05.01
测试东方财富各板块参数的数据量"""
import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

API = "https://push2delay.eastmoney.com/api/qt/clist/get"
UT = "bd1d9ddb04089700cf9c27f6f7426281"

# 各板块 FS 参数对照表
FS_BROAD = "m:0+t:6,m:0+t:13,m:0+t:80,m:0+t:81,m:1+t:2,m:1+t:23,m:1+t:80,m:0+t:82,m:1+t:82"

FS_MAP = {
    "沪深主板(旧参数)": "m:0+t:6,m:0+t:13,m:1+t:2,m:1+t:23",
    "科创板": "m:0+t:80,m:0+t:81,m:1+t:23,m:1+t:80",
    "创业板": "m:0+t:80,m:1+t:80",
    "北交所": "m:0+t:82,m:1+t:82",
    "沪深全量(推荐)": FS_BROAD,
}

print("=== 东方财富 API 各板块参数测试 ===\n")
for name, fs in FS_MAP.items():
    url = (f"{API}?pn=1&pz=1&po=1&np=1&ut={UT}&fltt=2&invt=2&fid=f3"
           f"&fs={fs}&fields=f12")
    req = urllib.request.Request(url, headers={"Referer": "https://finance.eastmoney.com/"})
    try:
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            total = (data.get("data") or {}).get("total") or 0
            print(f"  [{name}]")
            print(f"    FS参数: {fs}")
            print(f"    数据量: {total} 条\n")
    except Exception as e:
        print(f"  [{name}] ERROR: {e}\n")

print("=== FS 参数说明 ===")
print("  m:0+t:6   = 沪市主板")
print("  m:0+t:13  = 深市主板")
print("  m:0+t:80  = 科创板(沪)")
print("  m:0+t:81  = 科创板(沪)")
print("  m:1+t:2   = 深市主板")
print("  m:1+t:23  = 科创板(深)")
print("  m:1+t:80  = 创业板(深)")
print("  m:0+t:82  = 北交所(沪)")
print("  m:1+t:82  = 北交所(深)")
