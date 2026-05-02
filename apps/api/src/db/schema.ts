import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  full_name: text("full_name"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updated_at: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const stocks = sqliteTable(
  "stocks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts_code: text("ts_code").notNull().unique(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    area: text("area"),
    industry: text("industry"),
    fullname: text("fullname"),
    enname: text("enname"),
    cnspell: text("cnspell"),
    market: text("market"),
    exchange: text("exchange"),
    curr_type: text("curr_type"),
    list_status: text("list_status"),
    list_date: text("list_date"),
    delist_date: text("delist_date"),
    is_hs: text("is_hs"),
    act_name: text("act_name"),
    act_ent_type: text("act_ent_type"),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    industryIdx: index("idx_stocks_industry").on(table.industry),
    cnspellIdx: index("idx_stocks_cnspell").on(table.cnspell),
    nameIdx: index("idx_stocks_name").on(table.name),
  })
);

export const stockDaily = sqliteTable(
  "stock_daily",
  {
    ts_code: text("ts_code").notNull(),
    trade_date: text("trade_date").notNull(),
    open: real("open"),
    high: real("high"),
    low: real("low"),
    close: real("close"),
    pre_close: real("pre_close"),
    change: real("change"),
    pct_chg: real("pct_chg"),
    vol: real("vol"),
    amount: real("amount"),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.ts_code, table.trade_date] }),
    dateIdx: index("idx_daily_date").on(table.trade_date),
  })
);

export const notes = sqliteTable(
  "notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ts_code: text("ts_code").notNull(),
    content: text("content").notNull(),
    analysis_type: text("analysis_type"),
    rating: integer("rating"),
    tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userIdx: index("idx_notes_user").on(table.user_id),
    codeIdx: index("idx_notes_code").on(table.ts_code),
  })
);

export const favorites = sqliteTable(
  "favorites",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ts_code: text("ts_code").notNull(),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    uniq: uniqueIndex("uq_fav").on(table.user_id, table.ts_code),
    userIdx: index("idx_fav_user").on(table.user_id),
  })
);

export const valuationCache = sqliteTable(
  "valuation_cache",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id"),
    ts_code: text("ts_code").notNull(),
    type: text("type", { enum: ["dcf", "capm"] }).notNull(),
    params_hash: text("params_hash").notNull(),
    result: text("result", { mode: "json" }).notNull(),
    expires_at: text("expires_at").notNull(),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    uniq: uniqueIndex("uq_val").on(table.user_id, table.ts_code, table.type, table.params_hash),
  })
);

export const predictions = sqliteTable(
  "predictions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts_code: text("ts_code").notNull(),
    model_version: text("model_version").notNull().default("v1"),
    horizon_days: integer("horizon_days").notNull().default(5),
    predict_dates: text("predict_dates", { mode: "json" }).$type<string[]>().notNull(),
    predict_prices: text("predict_prices", { mode: "json" }).$type<number[]>().notNull(),
    confidence: real("confidence"),
    signal: text("signal", { enum: ["bull", "bear", "neutral"] }).notNull().default("neutral"),
    metrics: text("metrics", { mode: "json" }).$type<Record<string, unknown>>(),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    tsIdx: index("idx_pred_ts").on(table.ts_code),
    createdIdx: index("idx_pred_created").on(table.created_at),
  })
);

export const financialReports = sqliteTable(
  "financial_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts_code: text("ts_code").notNull(),
    announcement_id: text("announcement_id").notNull().unique(),
    title: text("title").notNull(),
    report_type: text("report_type"), // 年报 / 半年报 / 一季报 / 三季报 / 摘要
    report_period: text("report_period"), // 2025Q4 / 2025Q2 / 2026Q1
    announcement_date: text("announcement_date"),
    pdf_url: text("pdf_url").notNull(),
    file_size: integer("file_size"),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    tsIdx: index("idx_reports_ts").on(table.ts_code),
    periodIdx: index("idx_reports_period").on(table.report_period),
  })
);

export type DbUser = typeof users.$inferSelect;
export type DbStock = typeof stocks.$inferSelect;
export type DbStockDaily = typeof stockDaily.$inferSelect;
export type DbNote = typeof notes.$inferSelect;
export type DbFavorite = typeof favorites.$inferSelect;
export type DbPrediction = typeof predictions.$inferSelect;
export type DbFinancialReport = typeof financialReports.$inferSelect;
