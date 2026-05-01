/**
 * 东方财富（East Money）API 服务层
 * 官方免费接口，稳定可靠，覆盖行情/K线/财务数据
 *
 * Base URLs:
 *   - push2.eastmoney.com        实时行情 + 股票列表
 *   - push2his.eastmoney.com      历史K线
 *   - datacenter.eastmoney.com   财务数据
 */

const PUSH_BASE = "https://push2.eastmoney.com";
const PUSH_HIS_BASE = "https://push2his.eastmoney.com";
const DC_BASE = "https://datacenter.eastmoney.com";
const UT = "bd1d9ddb04089700cf9c27f6f7426281"; // 固定 ut 参数（东方财富通用）

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 东方财富 secid：沪市=1.xxxxxx，深市=0.xxxxxx */
export function tsCodeToSecid(ts_code: string): string {
  const code = ts_code.split(".")[0];
  const market = ts_code.split(".")[1];
  if (market === "SH") return `1.${code}`;
  if (market === "SZ") return `0.${code}`;
  // 创业板/科创板
  if (market === "BJ") return `0.${code}`;
  return `1.${code}`;
}

/** 将东方财富 secid 转回 ts_code */
export function secidToTsCode(secid: string): string {
  const [m, code] = secid.split(".");
  const market = m === "1" ? "SH" : "SZ";
  return `${code}.${market}`;
}

/** 格式化日期 YYYY-MM-DD → YYYYMMDD */
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// ---------------------------------------------------------------------------
// 实时行情（单股）
// ---------------------------------------------------------------------------

// f43=最新价 f44=涨跌 f45=涨跌% f46=成交量(手) f47=成交额 f48=开盘 f49=最高
// f50=最低 f51=今收 f52=昨收 f57=股票代码 f58=名称 f107=市盈率TTM f116=市净率
// f117=总市值 f204=流通市值 f205=市盈率(动态) f173=市销率TTM
const QUOTE_FIELDS =
  "f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f57,f58,f107,f116,f117,f173,f204,f205";

export interface Quote {
  ts_code: string;
  name: string;
  current_price: number;
  price_change: number;
  pct_chg: number;
  volume: number; // 手
  amount: number; // 元
  open: number;
  high: number;
  low: number;
  close: number;
  pre_close: number;
  pe_ttm: number | null;
  pb: number | null;
  market_cap: number | null; // 总市值（元）
  circulating_market_cap: number | null;
  ps_ttm: number | null;
}

/**
 * 获取单只股票实时行情
 * @param ts_code 格式：600519.SH
 */
export async function fetchQuote(ts_code: string): Promise<Quote | null> {
  const secid = tsCodeToSecid(ts_code);
  const url = `${PUSH_BASE}/api/qt/stock/get?secid=${secid}&fields=${QUOTE_FIELDS}&ut=${UT}&fltt=2&invt=2`;

  const res = await fetch(url, {
    headers: { Referer: "https://finance.eastmoney.com/" },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    data?: {
      f43?: number;
      f44?: number;
      f45?: number;
      f46?: number;
      f47?: number;
      f48?: number;
      f49?: number;
      f50?: number;
      f51?: number;
      f52?: number;
      f57?: string;
      f58?: string;
      f107?: number;
      f116?: number;
      f117?: number;
      f173?: number;
      f204?: number;
      f205?: number;
    };
  };

  const d = json.data;
  if (!d || !d.f57) return null;

  // 市值从元转为亿元
  const marketCapYuan = d.f117 ? d.f117 / 100000000 : null;
  const circCapYuan = d.f204 ? d.f204 / 100000000 : null;

  return {
    ts_code: `${d.f57}.${secid.startsWith("1") ? "SH" : "SZ"}`,
    name: d.f58 ?? "",
    current_price: (d.f43 ?? 0) / 100,
    price_change: (d.f44 ?? 0) / 100,
    pct_chg: (d.f45 ?? 0) / 100,
    volume: d.f46 ?? 0,
    amount: d.f47 ?? 0,
    open: (d.f48 ?? 0) / 100,
    high: (d.f49 ?? 0) / 100,
    low: (d.f50 ?? 0) / 100,
    close: (d.f51 ?? 0) / 100,
    pre_close: (d.f52 ?? 0) / 100,
    pe_ttm: d.f107 ? d.f107 / 100 : null,
    pb: d.f116 ? d.f116 / 100 : null,
    market_cap: marketCapYuan,
    circulating_market_cap: circCapYuan,
    ps_ttm: d.f173 ? d.f173 / 100 : null,
  };
}

// ---------------------------------------------------------------------------
// 批量实时行情（多股）
// ---------------------------------------------------------------------------

/**
 * 批量获取多只股票实时行情
 * @param ts_codes 股票代码列表
 */
export async function fetchQuotes(ts_codes: string[]): Promise<Quote[]> {
  if (ts_codes.length === 0) return [];
  const secids = ts_codes.map((c) => tsCodeToSecid(c)).join(",");
  const url = `${PUSH_BASE}/api/qt/ulist.np/get?secids=${secids}&fields=${QUOTE_FIELDS}&ut=${UT}&fltt=2&invt=2`;

  const res = await fetch(url, {
    headers: { Referer: "https://finance.eastmoney.com/" },
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    data?: {
      diff?: Array<{
        f43?: number;
        f44?: number;
        f45?: number;
        f46?: number;
        f47?: number;
        f48?: number;
        f49?: number;
        f50?: number;
        f51?: number;
        f52?: number;
        f57?: string;
        f58?: string;
        f107?: number;
        f116?: number;
        f117?: number;
        f173?: number;
        f204?: number;
        f205?: number;
      }>;
    };
  };

  const items = json.data?.diff ?? [];
  return items
    .map((d) => {
      if (!d.f57) return null;
      const m = d.f57.startsWith("6") ? "SH" : "SZ";
      return {
        ts_code: `${d.f57}.${m}`,
        name: d.f58 ?? "",
        current_price: (d.f43 ?? 0) / 100,
        price_change: (d.f44 ?? 0) / 100,
        pct_chg: (d.f45 ?? 0) / 100,
        volume: d.f46 ?? 0,
        amount: d.f47 ?? 0,
        open: (d.f48 ?? 0) / 100,
        high: (d.f49 ?? 0) / 100,
        low: (d.f50 ?? 0) / 100,
        close: (d.f51 ?? 0) / 100,
        pre_close: (d.f52 ?? 0) / 100,
        pe_ttm: d.f107 ? d.f107 / 100 : null,
        pb: d.f116 ? d.f116 / 100 : null,
        market_cap: d.f117 ? d.f117 / 100000000 : null,
        circulating_market_cap: d.f204 ? d.f204 / 100000000 : null,
        ps_ttm: d.f173 ? d.f173 / 100 : null,
      } as Quote;
    })
    .filter(Boolean) as Quote[];
}

// ---------------------------------------------------------------------------
// 历史K线
// ---------------------------------------------------------------------------

// Kline 字段：f1=日期 f2=开 f3=收 f4=高 f5=低 f6=成交量 f7=成交额 f8=振幅 f9=涨跌幅 f10=涨跌额
// f11=换手率 f12=量比
const KLINE_FIELDS = "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f15,f16,f17,f18";

export type KLinePeriod = "101" | "102" | "103" | "104"; // 日K=101 周K=102 月K=103 季K=104

export interface KLineRow {
  ts_code: string;
  trade_date: string; // YYYY-MM-DD
  open: number;
  close: number;
  high: number;
  low: number;
  vol: number;
  amount: number;
  amplitude: number; // 振幅 %
  pct_chg: number; // 涨跌幅 %
  price_change: number;
  turnover: number; // 换手率 %
}

/**
 * 获取股票历史K线
 * @param ts_code  格式：600519.SH
 * @param period   日K=101, 周K=102, 月K=103, 季K=104
 * @param startDate YYYYMMDD（留空则取全量）
 * @param endDate   YYYYMMDD
 * @param limit     最大条数（默认 600）
 */
export async function fetchKline(
  ts_code: string,
  period: KLinePeriod = "101",
  startDate?: string,
  endDate?: string,
  limit = 600
): Promise<KLineRow[]> {
  const secid = tsCodeToSecid(ts_code);
  const url = new URL(`${PUSH_HIS_BASE}/api/qt/stock/kline/get`);
  url.searchParams.set("secid", secid);
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14");
  url.searchParams.set("fields2", KLINE_FIELDS);
  url.searchParams.set("klt", period);
  url.searchParams.set("fqt", "0"); // 0=不复权 1=前复权 2=后复权
  url.searchParams.set("end", endDate ?? fmtDate(new Date()));
  url.searchParams.set("lmt", String(limit));
  if (startDate) url.searchParams.set("beg", startDate);

  const res = await fetch(url.toString(), {
    headers: { Referer: "https://finance.eastmoney.com/" },
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    data?: {
      klines?: string[];
    };
  };

  const klines = json.data?.klines ?? [];
  const market = secid.startsWith("1") ? "SH" : "SZ";
  return klines.map((line) => {
    const [date, open, close, high, low, vol, amount, amp, pct, change, turnover] =
      line.split(",");
    return {
      ts_code: `${ts_code.split(".")[0]}.${market}`,
      trade_date: date,
      open: parseFloat(open),
      close: parseFloat(close),
      high: parseFloat(high),
      low: parseFloat(low),
      vol: parseFloat(vol),
      amount: parseFloat(amount),
      amplitude: parseFloat(amp),
      pct_chg: parseFloat(pct),
      price_change: parseFloat(change),
      turnover: parseFloat(turnover),
    };
  });
}

// ---------------------------------------------------------------------------
// 股票列表（支持市场/行业筛选）
// ---------------------------------------------------------------------------

// clist 字段：f12=代码 f14=名称 f3=涨跌幅 f4=最新价 f5=开盘 f6=最高 f7=最低
// f15=历史最高 f16=历史最低 f17=今开 f18=成交量 f20=成交额
// f9=市盈率 f10=换手率 f23=总市值 f24=流通市值 f37=量比
// f38=振幅 f62=主力净流入
const CLIST_FIELDS =
  "f12,f14,f3,f4,f5,f6,f7,f15,f16,f17,f18,f20,f9,f10,f23,f24,f37,f38,f62";

export type MarketType = "SH" | "SZ" | "BJ" | "HS" | "ZT" | "CB"; // 全市场/沪/深/沪深/涨停/转债

export interface StockListItem {
  ts_code: string;
  symbol: string;
  name: string;
  pct_chg: number;
  current_price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  pe: number | null;
  turnover: number;
  total_market_cap: number | null; // 亿
  circ_market_cap: number | null; // 亿
  main_net_inflow: number | null; // 主力净流入（元）
}

/**
 * 获取股票列表（支持分页）
 * @param page 第几页（从1开始）
 * @param pageSize 每页数量
 * @param market 市场筛选
 * @param industry 行业筛选（留空则不限）
 */
export async function fetchStockList(
  page = 1,
  pageSize = 50,
  market: MarketType = "HS",
  industry?: string
): Promise<{ items: StockListItem[]; total: number; page: number; pageSize: number }> {
  // 东方财富板块代码
  const MARKET_CODES: Record<MarketType, string> = {
    SH: "m:1+t:23,m:1+t:80", // 沪市主板
    SZ: "m:0+t:80,m:0+t:81", // 深市主板
    BJ: "m:0+t:82+m:1+t:82", // 北交所
    HS: "m:0+t:80,m:0+t:81,m:1+t:23,m:1+t:80", // 全A股
    ZT: "m:0+t:80,m:0+t:81,m:1+t:23,m:1+t:80+f:!ST,f:!*", // A股排除ST（用于抓涨停）
    CB: "m:0+t:84", // 可转债
  };

  const fs = MARKET_CODES[market] ?? MARKET_CODES.HS;
  const url = new URL(`${PUSH_BASE}/api/qt/clist/get`);
  url.searchParams.set("pn", String(page));
  url.searchParams.set("pz", String(pageSize));
  url.searchParams.set("po", "1"); // 按涨幅降序
  url.searchParams.set("np", "1");
  url.searchParams.set("ut", UT);
  url.searchParams.set("fltt", "2");
  url.searchParams.set("invt", "2");
  url.searchParams.set("wbp2u", "|,0,0|");
  url.searchParams.set("fid", "f3"); // 按涨跌幅排序
  url.searchParams.set("fs", fs);
  url.searchParams.set("fields", CLIST_FIELDS);

  const res = await fetch(url.toString(), {
    headers: { Referer: "https://finance.eastmoney.com/" },
  });
  if (!res.ok) return { items: [], total: 0, page, pageSize };

  const json = (await res.json()) as {
    data?: {
      total?: number;
      diff?: Array<{
        f12?: string;
        f14?: string;
        f3?: number;
        f4?: number;
        f5?: number;
        f6?: number;
        f7?: number;
        f9?: number;
        f10?: number;
        f15?: number;
        f16?: number;
        f17?: number;
        f18?: number;
        f20?: number;
        f23?: number;
        f24?: number;
        f37?: number;
        f38?: number;
        f62?: number;
      }>;
    };
  };

  const items: StockListItem[] = (json.data?.diff ?? [])
    .map((d) => {
      if (!d.f12) return null;
      const code = d.f12;
      const exchange = code.startsWith("4") || code.startsWith("8") ? "BJ" : code.startsWith("6") ? "SH" : "SZ";
      return {
        ts_code: `${code}.${exchange}`,
        symbol: code,
        name: d.f14 ?? "",
        pct_chg: (d.f3 ?? 0) / 100,
        current_price: (d.f4 ?? 0) / 100,
        open: (d.f5 ?? 0) / 100,
        high: (d.f6 ?? 0) / 100,
        low: (d.f7 ?? 0) / 100,
        volume: d.f18 ?? 0,
        amount: d.f20 ?? 0,
        pe: d.f9 ? d.f9 / 100 : null,
        turnover: (d.f10 ?? 0) / 100,
        total_market_cap: d.f23 ? d.f23 / 100000000 : null,
        circ_market_cap: d.f24 ? d.f24 / 100000000 : null,
        main_net_inflow: d.f62 ? d.f62 : null,
      } as StockListItem;
    })
    .filter(Boolean) as StockListItem[];

  return {
    items,
    total: json.data?.total ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// 财务指标（PE/PB/ROE/营收/净利润等）
// ---------------------------------------------------------------------------

interface EmFinancialIndicator {
  SECURITY_CODE: string;
  REPORT_DATE: string;
  // 基本指标
  BASIC_EPS?: number; // 基本每股收益（元）
  DILUTED_EPS?: number; // 稀释每股收益
  BPS?: number; // 每股净资产
  ROE_AVG?: number; // 加权平均净资产收益率(%)
  DEBT_TO_ASSETS?: number; // 资产负债率(%)
  // 估值
  PE_LYR?: number; // 市盈率(静态)
  PE_TTM?: number; // 市盈率(TTM)
  PB_LYR?: number; // 市净率
  // 成长
  YOYGR?: number; // 营业总收入增长率(%)
  YOYNI?: number; // 净利润增长率(%)
  // 规模
  TOTAL_OPERATE_INCOME?: number; // 营业总收入（元）
  NET_PROFIT?: number; // 净利润（元）
  TOTAL_ASSETS?: number; // 总资产（元）
  TOTAL_LIABILITIES?: number; // 总负债（元）
  OPERATE_CASH_FLOW?: number; // 经营活动现金流净额（元）
}

/**
 * 获取单只股票财务指标（年报/季报）
 * @param ts_code 格式：600519.SH
 * @param startYear 开始年份（如 "2020"），留空取全量
 */
export async function fetchFinancialIndicator(
  ts_code: string
): Promise<EmFinancialIndicator[]> {
  const code = ts_code.split(".")[0];
  const url = new URL(`${DC_BASE}/securities/api/data/v1/get`);
  url.searchParams.set("reportName", "RPT_FCI_PCST"); // 财务基本面指标
  url.searchParams.set("columns", "SECURITY_CODE,REPORT_DATE,BASIC_EPS,DILUTED_EPS,BPS,ROE_AVG,DEBT_TO_ASSETS,PE_LYR,PE_TTM,PB_LYR,YOYGR,YOYNI,TOTAL_OPERATE_INCOME,NET_PROFIT,TOTAL_ASSETS,TOTAL_LIABILITIES,OPERATE_CASH_FLOW");
  url.searchParams.set("filter", `(SECURITY_CODE="${code}")`);
  url.searchParams.set("pageNumber", "1");
  url.searchParams.set("pageSize", "40");
  url.searchParams.set("sortTypes", "-1"); // 最新优先
  url.searchParams.set("sortColumns", "REPORT_DATE");
  url.searchParams.set("source", "DataCenter");
  url.searchParams.set("client", "PC");

  const res = await fetch(url.toString(), {
    headers: { Referer: "https://data.eastmoney.com/" },
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    result?: {
      data?: EmFinancialIndicator[];
    };
  };

  return json.result?.data ?? [];
}

/**
 * 获取股票最新财务指标（单条）
 */
export async function fetchLatestIndicator(ts_code: string): Promise<EmFinancialIndicator | null> {
  const rows = await fetchFinancialIndicator(ts_code);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// 财务报表（利润表/资产负债表/现金流量表）
// ---------------------------------------------------------------------------

type ReportName =
  | "RPT_LICO_FN_CPD"   // 合并利润表
  | "RPT_DMSK_FN_BAL"  // 资产负债表
  | "RPT_DMSK_FN_CAS";  // 现金流量表

const REPORT_NAME_MAP: Record<string, ReportName> = {
  income_statement: "RPT_LICO_FN_CPD",
  balance_sheet: "RPT_DMSK_FN_BAL",
  cash_flow: "RPT_DMSK_FN_CAS",
};

const REPORT_COLUMNS: Record<string, string> = {
  income_statement: "SECURITY_CODE,REPORT_DATE,PARENT_NETPROFIT,OPERATE_INCOME,OPERATE_PROFIT,TOTAL_OPERATE_INCOME,NET_PROFIT,EPS,JROA,GROWRATE_NETPROFIT",
  balance_sheet: "SECURITY_CODE,REPORT_DATE,TOTAL_ASSETS,TOTAL_LIABILITIES,OWNERS_EQUITY,TOTAL_CURRENT_ASSETS,TOTAL_NONCURRENT_ASSETS,TOTAL_CURRENT_LIABILITIES,TOTAL_NONCURRENT_LIABILITIES",
  cash_flow: "SECURITY_CODE,REPORT_DATE,MANAGE_CASHFLOW,INVEST_CASHFLOW,FINANCE_CASHFLOW,CASH_EQUIVALENT,CASH_NETINC_REDUCE",
};

interface EmFinancialReport {
  SECURITY_CODE: string;
  REPORT_DATE: string;
  [key: string]: unknown;
}

/**
 * 获取股票财务报表
 * @param ts_code 格式：600519.SH
 * @param reportType income_statement | balance_sheet | cash_flow
 */
export async function fetchFinancialReport(
  ts_code: string,
  reportType: "income_statement" | "balance_sheet" | "cash_flow"
): Promise<EmFinancialReport[]> {
  const code = ts_code.split(".")[0];
  const reportName = REPORT_NAME_MAP[reportType];
  const columns = REPORT_COLUMNS[reportType];

  const url = new URL(`${DC_BASE}/securities/api/data/v1/get`);
  url.searchParams.set("reportName", reportName);
  url.searchParams.set("columns", columns);
  url.searchParams.set("filter", `(SECURITY_CODE="${code}")`);
  url.searchParams.set("pageNumber", "1");
  url.searchParams.set("pageSize", "40");
  url.searchParams.set("sortTypes", "-1");
  url.searchParams.set("sortColumns", "REPORT_DATE");
  url.searchParams.set("source", "DataCenter");
  url.searchParams.set("client", "PC");

  const res = await fetch(url.toString(), {
    headers: { Referer: "https://data.eastmoney.com/" },
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    result?: {
      data?: EmFinancialReport[];
    };
  };

  return json.result?.data ?? [];
}

// ---------------------------------------------------------------------------
// 指数行情（大盘指数）
// ---------------------------------------------------------------------------

export interface IndexQuote {
  ts_code: string;
  name: string;
  current_index: number;
  price_change: number;
  pct_chg: number;
  volume: number;
  amount: number;
  high: number;
  low: number;
  open: number;
  pre_close: number;
}

const INDEX_LIST = [
  { secid: "1.000001", ts_code: "000001.SH", name: "上证指数" },
  { secid: "0.399001", ts_code: "399001.SZ", name: "深证成指" },
  { secid: "0.399006", ts_code: "399006.SZ", name: "创业板指" },
  { secid: "1.000688", ts_code: "000688.SH", name: "科创50" },
  { secid: "1.000300", ts_code: "000300.SH", name: "沪深300" },
];

const INDEX_FIELDS = "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14";

/**
 * 获取主要指数实时行情
 */
export async function fetchIndexQuotes(): Promise<IndexQuote[]> {
  const secids = INDEX_LIST.map((i) => i.secid).join(",");
  const url = `${PUSH_BASE}/api/qt/ulist.np/get?secids=${secids}&fields=${INDEX_FIELDS}&ut=${UT}&fltt=2&invt=2`;

  const res = await fetch(url, {
    headers: { Referer: "https://finance.eastmoney.com/" },
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    data?: {
      diff?: Array<{
        f2?: number;
        f3?: number;
        f4?: number;
        f5?: number;
        f6?: number;
        f7?: number;
        f8?: number;
        f9?: number;
        f10?: number;
        f12?: string;
        f14?: string;
      }>;
    };
  };

  const diff = json.data?.diff ?? [];
  return diff.map((d) => {
    const idx = INDEX_LIST.find((i) => i.secid === d.f12);
    return {
      ts_code: idx?.ts_code ?? `${d.f12}`,
      name: d.f14 ?? idx?.name ?? "",
      current_index: d.f2 ?? 0,
      price_change: d.f3 ?? 0,
      pct_chg: (d.f4 ?? 0) / 100,
      volume: d.f6 ?? 0,
      amount: d.f7 ?? 0,
      high: d.f8 ?? 0,
      low: d.f9 ?? 0,
      open: d.f5 ?? 0,
      pre_close: d.f10 ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// 行业板块列表
// ---------------------------------------------------------------------------

/**
 * 获取行业板块列表
 */
export async function fetchIndustryList(): Promise<Array<{ name: string; count: number; lead_stock?: string; lead_stock_name?: string }>> {
  const url = `${PUSH_BASE}/api/qt/clist/get?pn=1&pz=100&po=1&np=1&ut=${UT}&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f12,f14,f13,f3`;

  const res = await fetch(url, {
    headers: { Referer: "https://finance.eastmoney.com/" },
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    data?: {
      diff?: Array<{
        f12?: string;
        f13?: number;
        f14?: string;
      }>;
    };
  };

  return (json.data?.diff ?? [])
    .filter((d) => d.f14)
    .map((d) => ({
      name: d.f14 ?? "",
      count: d.f13 ?? 0,
    }));
}

// ---------------------------------------------------------------------------
// 概念板块
// ---------------------------------------------------------------------------

/**
 * 获取概念板块列表
 */
export async function fetchConceptList(): Promise<Array<{ name: string; count: number }>> {
  const url = `${PUSH_BASE}/api/qt/clist/get?pn=1&pz=200&po=1&np=1&ut=${UT}&fltt=2&invt=2&fid=f3&fs=m:90+t:3&fields=f12,f14,f13,f3`;

  const res = await fetch(url, {
    headers: { Referer: "https://finance.eastmoney.com/" },
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    data?: {
      diff?: Array<{
        f12?: string;
        f13?: number;
        f14?: string;
      }>;
    };
  };

  return (json.data?.diff ?? [])
    .filter((d) => d.f14)
    .map((d) => ({
      name: d.f14 ?? "",
      count: d.f13 ?? 0,
    }));
}
