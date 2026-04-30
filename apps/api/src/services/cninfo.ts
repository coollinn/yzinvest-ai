import type { FinancialType, ReportType } from "@yzinvest/shared";

const ENDPOINT_MAP: Record<FinancialType, string> = {
  balance_sheet: "getBalanceSheets",
  income_statement: "getIncomeStatement",
  cash_flow: "getCashFlowStatement",
  main_indicators: "getMainIndicators",
};

export interface CninfoRecord {
  data_key: string;
  data_value: number | null;
  report_type: ReportType;
  report_date: string;
}

interface CninfoApiResponse {
  code: number;
  msg?: string;
  data?: {
    records: Array<Record<string, Array<Record<string, number | string | null>>>>;
  };
}

const REPORT_TYPES: ReportType[] = ["year", "middle", "one", "three"];

/** 从 cninfo 抓取财报数据并解析为长表行 */
export async function fetchCninfoFinancial(
  ts_code: string,
  type: FinancialType,
  cookie: string
): Promise<CninfoRecord[]> {
  const stockCode = ts_code.split(".")[0];
  const apiPath = ENDPOINT_MAP[type];
  const url = `http://www.cninfo.com.cn/data20/financialData/${apiPath}?scode=${stockCode}&sign=1`;

  const res = await fetch(url, {
    headers: {
      Host: "www.cninfo.com.cn",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      Referer: `http://www.cninfo.com.cn/new/disclosure/stock?stockCode=${stockCode}`,
      "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
      Cookie: cookie,
    },
  });

  const json = (await res.json()) as CninfoApiResponse;
  if (json.code !== 200 || !json.data) {
    throw new Error(`cninfo error: ${json.msg ?? "unknown"} (code=${json.code})`);
  }

  const records = json.data.records[0];
  if (!records) return [];

  const out: CninfoRecord[] = [];
  for (const period of REPORT_TYPES) {
    const items = records[period];
    if (!items) continue;
    for (const item of items) {
      const indexName = item.index;
      if (typeof indexName !== "string") continue;
      for (const [year, value] of Object.entries(item)) {
        if (year === "index" || value === null || value === undefined) continue;
        const numeric = typeof value === "number" ? value : Number(value);
        if (Number.isNaN(numeric)) continue;
        out.push({
          data_key: indexName,
          data_value: numeric,
          report_type: period,
          report_date:
            period === "year"
              ? `${year}-12-31`
              : period === "middle"
                ? `${year}-06-30`
                : period === "one"
                  ? `${year}-03-31`
                  : `${year}-09-30`,
        });
      }
    }
  }
  return out;
}
