import type { DbStock } from "../db/schema";

const TUSHARE_URL = "https://api.tushare.pro";

export interface TushareResponse<T = unknown> {
  request_id: string;
  code: number;
  msg: string | null;
  data: {
    fields: string[];
    items: T[][];
    has_more: boolean;
  } | null;
}

async function callTushare<T = unknown>(
  apiName: string,
  params: Record<string, unknown>,
  token: string,
  fields?: string
): Promise<TushareResponse<T>> {
  const res = await fetch(TUSHARE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_name: apiName,
      token,
      params,
      ...(fields ? { fields } : {}),
    }),
  });
  return (await res.json()) as TushareResponse<T>;
}

export type StockBasicRow = Omit<DbStock, "id" | "created_at" | "updated_at">;

const STOCK_BASIC_FIELDS = [
  "ts_code",
  "symbol",
  "name",
  "area",
  "industry",
  "fullname",
  "enname",
  "cnspell",
  "market",
  "exchange",
  "curr_type",
  "list_status",
  "list_date",
  "delist_date",
  "is_hs",
  "act_name",
  "act_ent_type",
] as const;

export async function fetchStockBasic(token: string): Promise<StockBasicRow[]> {
  const res = await callTushare(
    "stock_basic",
    { exchange: "", list_status: "L" },
    token,
    STOCK_BASIC_FIELDS.join(",")
  );
  if (res.code !== 0) {
    throw new Error(`Tushare stock_basic error: ${res.msg ?? "unknown"}`);
  }
  if (!res.data) return [];
  const fields = res.data.fields;
  return res.data.items.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < fields.length; i++) {
      obj[fields[i]] = row[i];
    }
    return obj as unknown as StockBasicRow;
  });
}

const DAILY_FIELDS = [
  "ts_code",
  "trade_date",
  "open",
  "high",
  "low",
  "close",
  "pre_close",
  "change",
  "pct_chg",
  "vol",
  "amount",
] as const;

export interface DailyRow {
  ts_code: string;
  trade_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  pre_close: number | null;
  change: number | null;
  pct_chg: number | null;
  vol: number | null;
  amount: number | null;
}

/** 拉取单只股票的日线数据 */
export async function fetchDaily(
  ts_code: string,
  startDate: string, // YYYYMMDD
  endDate: string,
  token: string
): Promise<DailyRow[]> {
  const res = await callTushare(
    "daily",
    { ts_code, start_date: startDate, end_date: endDate },
    token,
    DAILY_FIELDS.join(",")
  );
  if (res.code !== 0) {
    throw new Error(`Tushare daily error: ${res.msg ?? "unknown"}`);
  }
  if (!res.data) return [];
  const fields = res.data.fields;
  return res.data.items.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < fields.length; i++) {
      obj[fields[i]] = row[i];
    }
    return obj as unknown as DailyRow;
  });
}
