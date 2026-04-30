import { createDb } from "../db/client";
import { stocks } from "../db/schema";
import { fetchStockBasic } from "../services/tushare";
import type { Env } from "../types";

/**
 * Cron `30 8 * * *` (UTC 8:30 = 北京 16:30，A 股收盘后)
 * 同步 stock_basic 全量
 */
export async function syncStocks(env: Env): Promise<void> {
  console.log("[cron] sync stocks: start");
  try {
    const list = await fetchStockBasic(env.TUSHARE_TOKEN);
    const db = createDb(env.DB);
    let count = 0;
    // 分批插入避免单 statement 超时
    const BATCH = 50;
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      for (const row of chunk) {
        await db
          .insert(stocks)
          .values(row)
          .onConflictDoUpdate({
            target: stocks.ts_code,
            set: {
              symbol: row.symbol,
              name: row.name,
              area: row.area,
              industry: row.industry,
              fullname: row.fullname,
              enname: row.enname,
              cnspell: row.cnspell,
              market: row.market,
              exchange: row.exchange,
              curr_type: row.curr_type,
              list_status: row.list_status,
              list_date: row.list_date,
              delist_date: row.delist_date,
              is_hs: row.is_hs,
              act_name: row.act_name,
              act_ent_type: row.act_ent_type,
              updated_at: new Date().toISOString(),
            },
          });
        count++;
      }
    }
    console.log(`[cron] sync stocks: done, ${count} rows`);
  } catch (err) {
    console.error("[cron] sync stocks failed:", err);
  }
}
