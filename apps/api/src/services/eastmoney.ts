/**
 * 东方财富（East Money）API 服务层
 * 官方免费接口，稳定可靠，覆盖行情/K线/财务数据
 *
 * Base URLs:
 *   - push2.eastmoney.com        实时行情 + 股票列表
 *   - push2his.eastmoney.com      历史K线
 *   - datacenter.eastmoney.com   财务数据
 *
 * 单位说明（fltt=2 时）：
 *   - f4（现价）: 已是元
 *   - f5/f7（开/低）: 分，需 /100 → 元
 *   - f6（高）: 万分，需 /10000 → 元
 *   - f18（成交量）: 手
 *   - f20（成交额）: 元
 *   - f23/f24（市值）: 亿元（已是亿元）
 */

const PUSH_BASE = "https://push2.eastmoney.com";
const PUSH_HIS_BASE = "https://push2his.eastmoney.com";
const DC_BASE = "https://datacenter.eastmoney.com";
const UT = "bd1d9ddb04089700cf9c27f6f7426281"; // 东方财富通用 ut 参数

// --------------------------------------------------------------------------
// 工具函数
// --------------------------------------------------------------------------

/** 东方财富 secid：沪市=1.xxxxxx，深市=0.xxxxxx */
export function tsCodeToSecid(ts_code: string): string {
  const code = ts_code.split(".")[0];
  const market = ts_code.split(".")[1];
  if (market === "SH") return `1.${code}`;
  if (market === "SZ" || market === "BJ") return `0.${code}`;
  return `1.${code}`;
}

/** 将东方财富 secid 转回 ts_code */
export function secidToTsCode(secid: string): string {
  const [m, code] = secid.split(".");
  return `${code}.${m === "1" ? "SH" : "SZ"}`;
}

/** 格式化日期 YYYY-MM-DD → YYYYMMDD */
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// --------------------------------------------------------------------------
// 实时行情（单股）
// --------------------------------------------------------------------------

// ulist API 字段（fltt=2 已生效）：
// f43=最新价(元) f44=涨跌额(元) f45=涨跌幅%(需/100) f46=成交量(手)
// f47=成交额(元) f48=今开(元) f49=最高(元) f50=最低(元)
// f51=今收(元) f52=昨收(元) f57=代码 f58=名称
// f107=市盈率TTM(需/100) f116=市净率(需/100) f117=总市值(元)
// f173=市销率TTM(需/100) f204=流通市值(元) f205=市盈率动态(需/100)
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
  market_cap: number | null; // 总市值（亿元）
  circulating_market_cap: number | null; // 流通市值（亿元）
  ps_ttm: number | null;
}

/**
 * 获取单只股票实时行情
 * @param ts_code 格式：600519.SH
 */
export async function fetchQuote(ts_code: string): Promise<Quote | null> {
  try {
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
      market_cap: d.f117 ? d.f117 / 100000000 : null,
      circulating_market_cap: d.f204 ? d.f204 / 100000000 : null,
      ps_ttm: d.f173 ? d.f173 / 100 : null,
    };
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// 批量实时行情（多股）
// --------------------------------------------------------------------------

/**
 * 批量获取多只股票实时行情
 * @param ts_codes 股票代码数组，如 ["600519.SH", "000001.SZ"]
 */
export async function fetchQuotes(ts_codes: string[]): Promise<Quote[]> {
  try {
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
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------
// 历史K线
// --------------------------------------------------------------------------

// Kline 字段（fqt=0 不复权）：
// f1=日期 f2=开 f3=收 f4=高 f5=低 f6=成交量 f7=成交额
// f8=振幅 f9=涨跌幅% f10=涨跌额 f11=换手率 f12=量比
// f13=成交额 f14=涨跌额(同f10) f15=开盘(同f2) f16=收盘(同f3) f17=最高(同f4) f18=最低(同f5)
const KLINE_FIELDS = "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f15,f16,f17,f18";

export type KLinePeriod = "101" | "102" | "103" | "104"; // 日K=101 周K=102 月K=103 季K=104

export interface KLineRow {
  date: string; // YYYY-MM-DD
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  amplitude: number | null; // 振幅 %
  pct_chg: number | null; // 涨跌幅 %
  price_change: number | null; // 涨跌额
  turnover: number | null; // 换手率 %
  volume_ratio: number | null; // 量比
}

/**
 * 获取历史K线数据
 * @param ts_code  股票代码，如 "600519.SH"
 * @param period    周期：101=日K 102=周K 103=月K 104=季K
 * @param startDate YYYY-MM-DD 格式起始日期
 * @param endDate   YYYY-MM-DD 格式截止日期
 * @param limit     最大条数（默认 600）
 */
export async function fetchKline(
  ts_code: string,
  period: KLinePeriod = "101",
  startDate?: string,
  endDate?: string,
  limit = 600
): Promise<KLineRow[]> {
  try {
    const secid = tsCodeToSecid(ts_code);
    const url = new URL(
      `${PUSH_HIS_BASE}/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12&fields2=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f15,f16,f17,f18`
    );
    url.searchParams.set("klt", period); // 101=日K
    url.searchParams.set("fqt", "0"); // 0=不复权
    url.searchParams.set("lmt", String(limit));
    url.searchParams.set("end", endDate ? fmtDate(new Date(endDate)) : fmtDate(new Date()));
    url.searchParams.set("beg", startDate ? fmtDate(new Date(startDate)) : "19000101");

    const res = await fetch(url.toString(), {
      headers: { Referer: "https://finance.eastmoney.com/" },
    });
    if (!res.ok) return [];

    const json = (await res.json()) as {
      data?: { klines?: string[] };
    };

    const raw = json.data?.klines ?? [];
    return raw.map((line) => {
      const [date, open, close, high, low, volume, amount, ...rest] = line.split(",");
      const [amplitude, pct_chg, price_change, turnover, volume_ratio] = rest;
      return {
        date,
        open: parseFloat(open) / 100,
        close: parseFloat(close) / 100,
        high: parseFloat(high) / 100,
        low: parseFloat(low) / 100,
        volume: parseFloat(volume),
        amount: parseFloat(amount),
        amplitude: amplitude ? parseFloat(amplitude) / 100 : null,
        pct_chg: pct_chg ? parseFloat(pct_chg) / 100 : null,
        price_change: price_change ? parseFloat(price_change) / 100 : null,
        turnover: turnover ? parseFloat(turnover) / 100 : null,
        volume_ratio: volume_ratio ? parseFloat(volume_ratio) / 100 : null,
      };
    });
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------
// 股票列表（实时行情批量）
// --------------------------------------------------------------------------

/**
 * 市场类型
 * SH = 沪市 | SZ = 深市 | BJ = 北交所 | HS = 全A股 | ZT = 涨停 | CB = 可转债
 */
export type MarketType = "SH" | "SZ" | "BJ" | "HS" | "ZT" | "CB";

export interface StockListItem {
  ts_code: string;
  symbol: string;
  name: string;
  pct_chg: number; // 涨跌幅 %
  current_price: number; // 最新价（元）
  open: number; // 开盘价（元）
  high: number; // 最高价（元）
  low: number; // 最低价（元）
  volume: number; // 成交量（手）
  amount: number; // 成交额（元）
  pe: number | null; // 市盈率（需/100）
  turnover: number | null; // 换手率 %
  total_market_cap: number | null; // 总市值（亿元）
  circ_market_cap: number | null; // 流通市值（亿元）
  main_net_inflow: number | null; // 主力净流入（元）
}

// clist API 字段（fltt=2 时）：
// f3=涨跌幅%(已转) f4=最新价元(已转) f5=开盘元(分需/100)
// f6=最高元(万分需/10000) f7=最低元(分需/100)
// f18=成交量(手) f20=成交额(元)
// f9=市盈率(需/100) f10=换手率%(已转) f23=总市值亿元(已转) f24=流通市值亿元(已转)
// f37=量比 f38=振幅 f62=主力净流入(元)
const CLIST_FIELDS =
  "f12,f14,f3,f4,f5,f6,f7,f15,f16,f17,f18,f20,f9,f10,f23,f24,f37,f38,f62";

/**
 * 获取实时股票列表（支持分页）
 * @param page     页码（从1开始）
 * @param pageSize 每页数量（建议不超过200）
 * @param market   市场筛选
 */
export async function fetchStockList(
  page = 1,
  pageSize = 50,
  market: MarketType = "HS"
): Promise<{ items: StockListItem[]; total: number; page: number; pageSize: number }> {
  try {
    const MARKET_CODES: Record<MarketType, string> = {
      SH: "m:1+t:23,m:1+t:80", // 沪市主板
      SZ: "m:0+t:80,m:0+t:81", // 深市主板
      BJ: "m:0+t:82,m:1+t:82", // 北交所
      HS: "m:0+t:80,m:0+t:81,m:1+t:23,m:1+t:80", // 全A股
      ZT: "m:0+t:80,m:0+t:81,m:1+t:23,m:1+t:80+f:!ST,f:!*", // A股排除ST
      CB: "m:0+t:84", // 可转债
    };

    const fs = MARKET_CODES[market] ?? MARKET_CODES.HS;
    const url = new URL(`${PUSH_BASE}/api/qt/clist/get`);
    url.searchParams.set("pn", String(page));
    url.searchParams.set("pz", String(pageSize));
    url.searchParams.set("po", "1"); // 按涨幅降序
    url.searchParams.set("np", "1");
    url.searchParams.set("ut", UT);
    url.searchParams.set("fltt", "2"); // 价格精度：2=元
    url.searchParams.set("invt", "2"); // 成交量精度：2=手
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
          f18?: number;
          f20?: number;
          f23?: number;
          f24?: number;
          f62?: number;
        }>;
      };
    };

    const items: StockListItem[] = (json.data?.diff ?? [])
      .map((d) => {
        if (!d.f12) return null;
        const code = d.f12;
        const exchange =
          code.startsWith("4") || code.startsWith("8")
            ? "BJ"
            : code.startsWith("6")
            ? "SH"
            : "SZ";
        return {
          ts_code: `${code}.${exchange}`,
          symbol: code,
          name: d.f14 ?? "",
          pct_chg: d.f3 ?? 0, // fltt=2: 已是 %
          current_price: d.f4 ?? 0, // fltt=2: 已是元
          open: (d.f5 ?? 0) / 100, // 分→元
          high: (d.f6 ?? 0) / 10000, // 万分→元
          low: (d.f7 ?? 0) / 100, // 分→元
          volume: d.f18 ?? 0, // invt=2: 已是手
          amount: d.f20 ?? 0, // 元
          pe: d.f9 ? d.f9 / 100 : null,
          turnover: d.f10 ?? 0, // fltt=2: 已是 %
          total_market_cap: d.f23 ?? null, // fltt=2: 已是亿元
          circ_market_cap: d.f24 ?? null, // fltt=2: 已是亿元
          main_net_inflow: d.f62 ?? null,
        } as StockListItem;
      })
      .filter(Boolean) as StockListItem[];

    return {
      items,
      total: json.data?.total ?? 0,
      page,
      pageSize,
    };
  } catch {
    return { items: [], total: 0, page, pageSize };
  }
}

// --------------------------------------------------------------------------
// 财务指标
// --------------------------------------------------------------------------

// 东方财富财务指标字段：
// BASIC_EPS=每股收益(元) BPS=每股净资产(元) ROE_AVG=净资产收益率(%)
// PE_TTM=市盈率TTM PB_LYR=市净率(动) YOYGR=营收增速(%) YOYNI=净利润增速(%)
// SQQY=市销率TTM IOG=投入资本回报率(%) GPR=销售毛利率(%)
// NETPROFIT=归属净利润(万元) TURNOVER=周转率(%) DEBTEQUITYR=资产负债率(%)
export interface EmFinancialIndicator {
  SECURITY_CODE: string;
  REPORT_DATE: string;
  BASIC_EPS: number | null;
  BPS: number | null;
  ROE_AVG: number | null; // %
  PE_TTM: number | null;
  PB_LYR: number | null;
  YOYGR: number | null; // %
  YOYNI: number | null; // %
  SQQY: number | null; // 市销率TTM
  IOG: number | null; // %
  GPR: number | null; // %
  NETPROFIT: number | null; // 万元
  TURNOVER: number | null; // %
  DEBTEQUITYR: number | null; // %
}

/**
 * 获取财务指标（近40期，最新优先）
 */
export async function fetchFinancialIndicator(
  ts_code: string
): Promise<EmFinancialIndicator[]> {
  try {
    const url = new URL(
      `${DC_BASE}/securities/api/data/v1/get?reportName=RPT_FCI_PCST&columns=SECURITY_CODE,REPORT_DATE,BASIC_EPS,BPS,ROE_AVG,PE_TTM,PB_LYR,YOYGR,YOYNI,SQQY,IOG,GPR,NETPROFIT,TURNOVER,DEBTEQUITYR&filter=(SECURITY_CODE%3D%22${ts_code.split(".")[0]}%22)&pageNumber=1&pageSize=40&sortTypes=-1&sortColumns=REPORT_DATE&source=DataCenter&client=PC`
    );

    const res = await fetch(url.toString(), {
      headers: { Referer: "https://finance.eastmoney.com/" },
    });
    if (!res.ok) return [];

    const json = (await res.json()) as {
      data?: {
        result?: {
          data?: Array<Record<string, unknown>>;
        };
      };
    };

    return (json.data?.result?.data ?? []).map((d) => ({
      SECURITY_CODE: String(d.SECURITY_CODE ?? ""),
      REPORT_DATE: String(d.REPORT_DATE ?? ""),
      BASIC_EPS: d.BASIC_EPS ? Number(d.BASIC_EPS) : null,
      BPS: d.BPS ? Number(d.BPS) : null,
      ROE_AVG: d.ROE_AVG ? Number(d.ROE_AVG) : null,
      PE_TTM: d.PE_TTM ? Number(d.PE_TTM) : null,
      PB_LYR: d.PB_LYR ? Number(d.PB_LYR) : null,
      YOYGR: d.YOYGR ? Number(d.YOYGR) : null,
      YOYNI: d.YOYNI ? Number(d.YOYNI) : null,
      SQQY: d.SQQY ? Number(d.SQQY) : null,
      IOG: d.IOG ? Number(d.IOG) : null,
      GPR: d.GPR ? Number(d.GPR) : null,
      NETPROFIT: d.NETPROFIT ? Number(d.NETPROFIT) : null,
      TURNOVER: d.TURNOVER ? Number(d.TURNOVER) : null,
      DEBTEQUITYR: d.DEBTEQUITYR ? Number(d.DEBTEQUITYR) : null,
    })) as EmFinancialIndicator[];
  } catch {
    return [];
  }
}

/** 获取最新一期财务指标 */
export async function fetchLatestIndicator(
  ts_code: string
): Promise<EmFinancialIndicator | null> {
  const rows = await fetchFinancialIndicator(ts_code);
  return rows[0] ?? null;
}

// --------------------------------------------------------------------------
// 财务报表（利润表/资产负债表/现金流量表）
// --------------------------------------------------------------------------

type ReportName =
  | "RPT_LICO_FN_CPD" // 合并利润表
  | "RPT_DMSK_FN_BAL" // 资产负债表
  | "RPT_DMSK_FN_CAS"; // 现金流量表

const REPORT_NAME_MAP: Record<string, ReportName> = {
  income_statement: "RPT_LICO_FN_CPD",
  balance_sheet: "RPT_DMSK_FN_BAL",
  cash_flow: "RPT_DMSK_FN_CAS",
};

/**
 * 获取财务报表
 * @param ts_code     股票代码，如 "600519.SH"
 * @param reportType  报表类型：income_statement | balance_sheet | cash_flow
 */
export async function fetchFinancialReport(
  ts_code: string,
  reportType: keyof typeof REPORT_NAME_MAP = "income_statement"
): Promise<Array<Record<string, unknown>>> {
  try {
    const reportName = REPORT_NAME_MAP[reportType];
    const url = new URL(
      `${DC_BASE}/securities/api/data/v1/get?reportName=${reportName}&columns=SECURITY_CODE,REPORT_DATE,REPORT_TYPE,PARENT_CODE&filter=(SECURITY_CODE%3D%22${ts_code.split(".")[0]}%22)&pageNumber=1&pageSize=20&sortTypes=-1&sortColumns=REPORT_DATE&source=DataCenter&client=PC`
    );

    const res = await fetch(url.toString(), {
      headers: { Referer: "https://finance.eastmoney.com/" },
    });
    if (!res.ok) return [];

    const json = (await res.json()) as {
      data?: {
        result?: {
          data?: Array<Record<string, unknown>>;
        };
      };
    };

    return json.data?.result?.data ?? [];
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------
// 主要指数行情
// --------------------------------------------------------------------------

const INDEX_LIST = [
  { secid: "1.000001", ts_code: "000001.SH", name: "上证指数" },
  { secid: "0.399001", ts_code: "399001.SZ", name: "深证成指" },
  { secid: "0.399006", ts_code: "399006.SZ", name: "创业板指" },
  { secid: "1.000688", ts_code: "000688.SH", name: "科创50" },
  { secid: "1.000300", ts_code: "000300.SH", name: "沪深300" },
];

// ulist API 指数字段：
// f2=当前点位 f3=涨跌额(点) f4=涨跌幅%(需/100)
// f5=今开(点) f6=成交量(亿) f7=成交额(亿)
// f8=最高(点) f9=最低(点) f10=昨收(点) f12=secid f14=名称
const INDEX_FIELDS = "f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14";

export interface IndexQuote {
  ts_code: string;
  name: string;
  current_index: number; // 当前点位
  price_change: number; // 涨跌额（点）
  pct_chg: number; // 涨跌幅 %
  volume: number; // 成交量（亿）
  amount: number; // 成交额（亿）
  high: number; // 最高点
  low: number; // 最低点
  open: number; // 开盘点位
  pre_close: number; // 昨收点位
}

/** 获取主要指数实时行情 */
export async function fetchIndexQuotes(): Promise<IndexQuote[]> {
  try {
    const secids = INDEX_LIST.map((i) => i.secid).join(",");
    const url = `${PUSH_BASE}/api/qt/ulist.np/get?secids=${secids}&fields=${INDEX_FIELDS}&ut=${UT}&fltt=2`;

    const res = await fetch(url.toString(), {
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

    return (json.data?.diff ?? []).map((d) => {
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
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------
// 行业板块
// --------------------------------------------------------------------------

/** 获取行业板块列表 */
export async function fetchIndustryList(): Promise<
  Array<{ name: string; count: number; lead_stock?: string; lead_stock_name?: string }>
> {
  try {
    const url = `${PUSH_BASE}/api/qt/clist/get?pn=1&pz=100&po=1&np=1&ut=${UT}&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f12,f14,f13,f3`;

    const res = await fetch(url, {
      headers: { Referer: "https://finance.eastmoney.com/" },
    });
    if (!res.ok) return [];

    const json = (await res.json()) as {
      data?: {
        diff?: Array<{
          f12?: string;
          f14?: string;
          f13?: string;
          f3?: number;
        }>;
      };
    };

    return (json.data?.diff ?? [])
      .filter((d) => d.f14)
      .map((d) => ({
        name: d.f14 ?? "",
        count: parseInt(d.f13 ?? "0", 10),
        lead_stock: d.f12,
      }));
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------
// 概念板块
// --------------------------------------------------------------------------

/** 获取概念板块列表 */
export async function fetchConceptList(): Promise<Array<{ name: string; count: number }>> {
  try {
    const url = `${PUSH_BASE}/api/qt/clist/get?pn=1&pz=200&po=1&np=1&ut=${UT}&fltt=2&invt=2&fid=f3&fs=m:90+t:3&fields=f12,f14,f13,f3`;

    const res = await fetch(url, {
      headers: { Referer: "https://finance.eastmoney.com/" },
    });
    if (!res.ok) return [];

    const json = (await res.json()) as {
      data?: {
        diff?: Array<{
          f12?: string;
          f14?: string;
          f13?: string;
          f3?: number;
        }>;
      };
    };

    return (json.data?.diff ?? [])
      .filter((d) => d.f14)
      .map((d) => ({
        name: d.f14 ?? "",
        count: parseInt(d.f13 ?? "0", 10),
      }));
  } catch {
    return [];
  }
}
