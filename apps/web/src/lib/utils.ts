import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 格式化数字：5000 → "5,000"，自动保留 2 位小数 */
export function formatNumber(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {}
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}

/** 格式化金额：1234567 → "123.46 万"，1234567890 → "12.35 亿" */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(2)} 万`;
  return formatNumber(value);
}

/** 格式化成交量：45000000 → "4500 万"，1234567890 → "12.35 亿" */
export function formatVolume(value: number | null | undefined): string {
  return formatCurrency(value);
}

/** 格式化百分比：0.0128 → "+1.28%"（带正负号） */
export function formatPercent(
  value: number | null | undefined,
  withSign = true,
  /** 输入是否为小数。true: 0.05→5%, false: 5→5% */
  fromDecimal = false
): string {
  if (value == null || Number.isNaN(value)) return "—";
  const v = fromDecimal ? value * 100 : value;
  const sign = withSign && v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

/** 涨跌色 class（红涨绿跌） */
export function colorByChange(value: number | null | undefined): string {
  if (value == null || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-up" : "text-down";
}

/** Tushare 日期 YYYYMMDD → "YYYY-MM-DD" */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  if (dateStr.length === 8) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  return dateStr;
}
