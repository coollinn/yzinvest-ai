#!/usr/bin/env node
/**
 * 本地同步脚本：从东方财富获取股票列表，写入本地 D1 数据库
 * 用法：node scripts/sync-stocks-local.js [pageSize=100] [maxPages=5]
 *
 * 需要 wrangler dev 在后台运行（端口 8787）
 */

const API_BASE = "https://push2delay.eastmoney.com/api/qt/clist/get";
const UT = "bd1d9ddb04089700cf9c27f6f7426281";

// 从环境变量或命令行参数获取 token
async function getToken() {
  try {
    const res = await fetch("http://localhost:8787/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "leon", password: "YzInvest2026!" }),
    });
    const json = await res.json();
    return json?.data?.access_token;
  } catch {
    console.error("登录失败，请确保 wrangler dev 正在运行（端口 8787）");
    process.exit(1);
  }
}

function buildUrl(page, pageSize, market = "HS") {
  const fsMap = {
    SH: "m:1+t:23,m:1+t:80",
    SZ: "m:0+t:80,m:0+t:81",
    BJ: "m:0+t:82,m:1+t:82",
    HS: "m:0+t:80,m:0+t:81,m:1+t:23,m:1+t:80",
    ZT: "m:0+t:80,m:0+t:81,m:1+t:23,m:1+t:80+f:!ST,f:!*",
  };
  const fs = fsMap[market] ?? fsMap.HS;
  const params = new URLSearchParams({
    pn: String(page),
    pz: String(pageSize),
    po: "1",
    np: "1",
    ut: UT,
    fltt: "2",
    invt: "2",
    fid: "f3",
    fs,
    fields: "f12,f14,f3,f4,f5,f6,f7,f15,f16,f17,f18,f20",
  });
  return `${API_BASE}?${params.toString()}`;
}

async function fetchStockPage(page, pageSize, market = "HS") {
  const url = buildUrl(page, pageSize, market);
  const res = await fetch(url, {
    headers: { Referer: "https://finance.eastmoney.com/" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for page ${page}`);
  const json = await res.json();
  return json?.data ?? { total: 0, diff: [] };
}

async function syncToDb(token, items) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

  let stockCount = 0;
  let dailyCount = 0;
  const errors = [];

  for (const item of items) {
    const f12 = item.f12;
    const f14 = item.f14;
    if (!f12) continue;

    const isBJ = f12.startsWith("4") || f12.startsWith("8") || f12.startsWith("9");
    const exchange = isBJ ? "BJ" : f12.startsWith("6") ? "SH" : "SZ";
    const tsCode = `${f12}.${exchange}`;

    // 构造 upsert SQL（stocks 表）
    const stockSql = `
      INSERT INTO stocks (ts_code, symbol, name, exchange, list_status, created_at, updated_at)
      VALUES ('${tsCode}', '${f12}', '${f14?.replace(/'/g, "''")}', '${exchange}', 'L', datetime('now'), datetime('now'))
      ON CONFLICT(ts_code) DO UPDATE SET
        name=excluded.name, updated_at=datetime('now');
    `;

    try {
      const r1 = await fetch(`http://localhost:8787/api/admin/sql-exec`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sql: stockSql }),
      });
      stockCount++;
    } catch (e) {
      errors.push(`stock ${tsCode}: ${e.message}`);
    }

    // 构造 stockDaily upsert（如果有价格数据）
    const currentPrice = item.f4 ?? 0;
    if (currentPrice > 0) {
      const open = (item.f5 ?? 0) / 100;
      const high = (item.f6 ?? 0) / 10000;
      const low = (item.f7 ?? 0) / 100;
      const vol = item.f18 ?? 0;
      const amount = item.f20 ?? 0;
      const pctChg = item.f3 ?? 0;
      const preClose = currentPrice / (1 + pctChg / 100);

      const dailySql = `
        INSERT INTO stock_daily (ts_code, trade_date, open, high, low, close, pre_close, change, pct_chg, vol, amount, created_at)
        VALUES (
          '${tsCode}', '${todayStr}',
          ${open}, ${high}, ${low}, ${currentPrice}, ${preClose},
          ${currentPrice - preClose}, ${pctChg},
          ${vol}, ${amount}, datetime('now')
        )
        ON CONFLICT(ts_code, trade_date) DO UPDATE SET
          open=excluded.open, high=excluded.high, low=excluded.low,
          close=excluded.close, pre_close=excluded.pre_close,
          change=excluded.change, pct_chg=excluded.pct_chg,
          vol=excluded.vol, amount=excluded.amount;
      `;

      try {
        await fetch(`http://localhost:8787/api/admin/sql-exec`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sql: dailySql }),
        });
        dailyCount++;
      } catch (e) {
        errors.push(`daily ${tsCode}: ${e.message}`);
      }
    }
  }

  return { stockCount, dailyCount, errors };
}

async function main() {
  const pageSize = parseInt(process.argv[2] ?? "100", 10);
  const maxPages = parseInt(process.argv[3] ?? "3", 10);
  const market = process.argv[4] ?? "HS";

  console.log(`开始同步：${market} 市场，每页 ${pageSize} 条，最多 ${maxPages} 页`);

  const token = await getToken();
  console.log("登录成功，开始同步...");

  let totalStocks = 0;
  let totalDaily = 0;

  for (let page = 1; page <= maxPages; page++) {
    try {
      console.log(`\n[第 ${page}/${maxPages} 页] 获取数据中...`);
      const data = await fetchStockPage(page, pageSize, market);
      const items = data.diff ?? [];
      console.log(`  获取到 ${items.length} 条记录（总计 ${data.total}）`);

      if (items.length === 0) break;

      console.log(`  写入数据库...`);
      const result = await syncToDb(token, items);
      totalStocks += result.stockCount;
      totalDaily += result.dailyCount;
      console.log(`  完成：stocks +${result.stockCount}，daily +${result.dailyCount}`);
      if (result.errors.length > 0) {
        console.warn(`  警告：${result.errors.length} 个错误`);
      }

      if (page * pageSize >= data.total) break;
    } catch (err) {
      console.error(`第 ${page} 页失败：${err.message}`);
      if (page > 1) break;
    }
  }

  console.log(`\n✅ 同步完成！`);
  console.log(`   股票记录：${totalStocks} 条`);
  console.log(`   日K记录：${totalDaily} 条`);
}

main().catch(console.error);
