// ───── core entities ─────

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: "user" | "admin";
  created_at: string; // ISO 8601
  updated_at: string;
}

export interface Stock {
  id: number;
  ts_code: string;
  symbol: string;
  name: string;
  area: string | null;
  industry: string | null;
  fullname: string | null;
  cnspell: string | null;
  market: string | null;
  exchange: string | null;
  list_status: string | null;
  list_date: string | null;
}

export interface StockDaily {
  ts_code: string;
  trade_date: string; // YYYYMMDD
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

export interface Note {
  id: number;
  user_id: number;
  ts_code: string;
  content: string;
  analysis_type: string | null;
  rating: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Favorite {
  id: number;
  user_id: number;
  ts_code: string;
  sort_order: number;
  created_at: string;
}

// ───── auth response ─────

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

// ───── stock detail ─────

export interface AnalysisData {
  current_price: number | null;
  price_change: number | null;
  pct_chg: number | null;
  volume: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  pre_close: number | null;
}

export interface StockDetailResponse {
  stock: Stock;
  analysis_data: AnalysisData;
  has_real_data: boolean;
  has_financial_data: boolean;
}

// ───── financial ─────

export type FinancialType =
  | "balance_sheet"
  | "income_statement"
  | "cash_flow"
  | "main_indicators";

export type ReportType = "year" | "middle" | "one" | "three";

export interface FinancialDataItem {
  data_key: string;
  data_value: number | null;
  data_unit: string | null;
}

export interface FinancialDataByPeriod {
  // report_type → report_date → data_key → value
  [reportType: string]: {
    [reportDate: string]: {
      [dataKey: string]: { value: number | null; unit: string | null };
    };
  };
}

export interface FinancialResponse {
  stock: { ts_code: string; symbol: string; name: string };
  financial_type: FinancialType;
  data: FinancialDataByPeriod;
}

// ───── valuation ─────

export interface DCFResult {
  intrinsicValue: number;
  marginOfSafety: number;
  presentValue: number;
  terminalValue: number;
}

export interface CAPMResult {
  expectedReturn: number;
  riskPremium: number;
}

// ───── pagination ─────

export interface Pagination {
  current_page: number;
  total_pages: number;
  total_items: number;
  items_per_page: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ListResponse<T> {
  items: T[];
  pagination: Pagination;
}
