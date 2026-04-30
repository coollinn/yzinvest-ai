import type { CAPMInputs, CAPMResult, DCFInputs, DCFResult } from "@yzinvest/shared";

/**
 * 5 年预测 + 终值 DCF 估值
 * 与后端 apps/api/src/routes/valuation.ts 公式保持一致
 */
export function calculateDCF(input: DCFInputs): DCFResult {
  const { freeCashFlow, growthRate, discountRate, terminalGrowth } = input;
  const FORECAST_PERIOD = 5;
  let presentValue = 0;
  for (let i = 1; i <= FORECAST_PERIOD; i++) {
    const futureCashFlow = freeCashFlow * Math.pow(1 + growthRate / 100, i);
    const discountFactor = Math.pow(1 + discountRate / 100, i);
    presentValue += futureCashFlow / discountFactor;
  }
  const terminalValue =
    (freeCashFlow * Math.pow(1 + growthRate / 100, FORECAST_PERIOD + 1)) /
    (discountRate / 100 - terminalGrowth / 100);
  const terminalValuePresent =
    terminalValue / Math.pow(1 + discountRate / 100, FORECAST_PERIOD);
  const intrinsicValue = presentValue + terminalValuePresent;
  const marginOfSafety = (intrinsicValue - freeCashFlow * 10) / (freeCashFlow * 10);
  return {
    intrinsicValue,
    marginOfSafety,
    presentValue,
    terminalValue: terminalValuePresent,
  };
}

export function calculateCAPM(input: CAPMInputs): CAPMResult {
  const { riskFreeRate, marketReturn, beta } = input;
  const riskPremium = (marketReturn - riskFreeRate) / 100;
  const expectedReturn = riskFreeRate / 100 + beta * riskPremium;
  return { expectedReturn, riskPremium };
}
