import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { stockDaily, stocks } from "../db/schema";
import { fetchKline, fetchStockList, tsCodeToSecid } from "../services/eastmoney";
import type { Env } from "../types";

/**
 * Cron `30 8 * * *` (UTC 8:30 = 北京 16:30，A 股收盘后)
 * 1. 东方财富批量行情列表（更新市场基础信息）
 * 2. 东方财富日K线（更新当天收盘数据）
 */
export async function syncStocks(env: Env): Promise<void> {
  console.log("[cron] sync stocks: start");
  const db = createDb(env.DB);

  // -------------------------------------------------------------------
  // 步骤 1：同步当天日K数据（从东方财富）
  // -------------------------------------------------------------------
  try {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const todayStr = `${y}${m}${day}`;
    const startStr = `${y - 1}${m}${day}`; // 近一年

    // 从东方财富批量行情（沪深全A，取前1000条，足够覆盖主要股票）
    const marketResult = await fetchStockList(1, 1000, "HS");
    const batch = marketResult.items;
    console.log(`[cron] eastmoney stock list: ${batch.length} stocks`);

    let updated = 0;
    for (const item of batch) {
      // 1a. Upsert stocks 表（基础信息）
      const [existing] = await db
        .select()
        .from(stocks)
        .where(eq(stocks.ts_code, item.ts_code))
        .limit(1);

      if (!existing) {
        // 新股 → 插入基本信息（可选字段留空，东方财富列表数据有限）
        await db
          .insert(stocks)
          .values({
            ts_code: item.ts_code,
            symbol: item.symbol,
            name: item.name,
            market: item.ts_code.endsWith(".SH") ? "主板" : item.ts_code.endsWith(".SZ") ? "主板" : "北交所",
            exchange: item.ts_code.split(".")[1],
            list_status: "L",
          })
          .onConflictDoNothing();
      }

      // 1b. Upsert stockDaily 日线数据（东方财富实时行情 → 近似日K）
      // 注意：实时行情是盘中数据，收盘后才是当日真实收盘价
      // 东方财富 push2 接口在收盘后会推送结算数据，可直接用
      if (item.current_price > 0) {
        await db
          .insert(stockDaily)
          .values({
            ts_code: item.ts_code,
            trade_date: todayStr,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.current_price,
            pre_close: item.current_price / (1 + item.pct_chg / 100),
            change: item.pct_chg * item.current_price / 100,
            pct_chg: item.pct_chg,
            vol: item.volume,
            amount: item.amount,
          })
          .onConflictDoUpdate({
            target: [stockDaily.ts_code, stockDaily.trade_date],
            set: {
              open: item.open,
              high: item.high,
              low: item.low,
              close: item.current_price,
              pre_close: item.current_price - item.pct_chg * item.current_price / 100,
              change: item.pct_chg * item.current_price / 100,
              pct_chg: item.pct_chg,
              vol: item.volume,
              amount: item.amount,
            },
          });
        updated++;
      }
    }

    console.log(`[cron] sync stocks: ${updated} stocks daily data updated`);
  } catch (err) {
    console.error("[cron] sync stocks (eastmoney) failed:", err);
  }

  console.log("[cron] sync stocks: done");
}
