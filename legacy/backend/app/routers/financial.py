from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import requests
import json
from typing import Dict, List, Optional

from ..database import get_db
from .. import models

router = APIRouter(prefix="/api/financial", tags=["financial data"])

# Financial data mapping for cninfo API
FINANCIAL_TYPE_MAP = {
    "balance_sheet": "getBalanceSheets",
    "income_statement": "getIncomeStatement",
    "cash_flow": "getCashFlowStatement",
    "main_indicators": "getMainIndicators"
}

@router.get("/{ts_code}/balance-sheet")
def get_balance_sheet(
    ts_code: str,
    db: Session = Depends(get_db)
):
    """Get balance sheet data for a stock"""
    return fetch_financial_data(ts_code, "balance_sheet", db)

@router.get("/{ts_code}/income-statement")
def get_income_statement(
    ts_code: str,
    db: Session = Depends(get_db)
):
    """Get income statement data for a stock"""
    return fetch_financial_data(ts_code, "income_statement", db)

@router.get("/{ts_code}/cash-flow")
def get_cash_flow(
    ts_code: str,
    db: Session = Depends(get_db)
):
    """Get cash flow statement data for a stock"""
    return fetch_financial_data(ts_code, "cash_flow", db)

@router.get("/{ts_code}/main-indicators")
def get_main_indicators(
    ts_code: str,
    db: Session = Depends(get_db)
):
    """Get main financial indicators for a stock"""
    return fetch_financial_data(ts_code, "main_indicators", db)

@router.post("/{ts_code}/sync")
def sync_financial_data(
    ts_code: str,
    financial_type: str = Query(..., description="balance_sheet, income_statement, cash_flow, main_indicators"),
    db: Session = Depends(get_db)
):
    """Sync financial data from cninfo for a specific stock"""
    try:
        # Verify stock exists
        stock = db.query(models.Stock).filter(models.Stock.ts_code == ts_code).first()
        if not stock:
            raise HTTPException(status_code=404, detail="Stock not found")

        # Extract stock code from ts_code (remove exchange suffix)
        stock_code = ts_code.split('.')[0]

        # Fetch data from cninfo
        api_name = FINANCIAL_TYPE_MAP.get(financial_type)
        if not api_name:
            raise HTTPException(status_code=400, detail="Invalid financial type")

        url = f"http://www.cninfo.com.cn/data20/financialData/{api_name}"
        headers = {
            "Host": "www.cninfo.com.cn",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Referer": f"http://www.cninfo.com.cn/new/disclosure/stock?orgId=9900026455&stockCode={stock_code}",
            "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cookie": "SF_cookie_4=17470996; insert_cookie=45380249; _sp_ses.2141=*; cninfo_user_browse=300502,9900026455,%E6%96%B0%E6%98%93%E7%9B%9B; _sp_id.2141=4f5bad8e-067c-4043-a981-636944fe3ade.1759741851.1.1759742008.1759741851.413efed7-2808-48d5-9a61-e35cd9814997"
        }

        response = requests.get(url, params={"scode": stock_code, "sign": 1}, headers=headers)
        data = response.json()

        if data["code"] != 200:
            raise HTTPException(status_code=400, detail=f"API error: {data.get('msg', 'Unknown error')}")

        # Process and store the data
        records = data["data"]["records"]
        saved_count = 0

        for period_type, period_data in records[0].items():
            if period_type in ["year", "middle", "one", "three"]:
                for item in period_data:
                    if "index" not in item:
                        continue

                    index_name = item["index"]
                    for year, value in item.items():
                        if year == "index" or value is None:
                            continue

                        # Create report date (approximate based on period type)
                        report_date = f"{year}-12-31" if period_type == "year" else f"{year}-06-30"

                        # Check if data already exists
                        existing = db.query(models.FinancialData).filter(
                            models.FinancialData.ts_code == ts_code,
                            models.FinancialData.report_type == period_type,
                            models.FinancialData.report_date == report_date,
                            models.FinancialData.financial_type == financial_type,
                            models.FinancialData.data_key == index_name
                        ).first()

                        if existing:
                            # Update existing record
                            existing.data_value = float(value) if value else None
                        else:
                            # Create new record
                            financial_data = models.FinancialData(
                                ts_code=ts_code,
                                report_type=period_type,
                                report_date=report_date,
                                financial_type=financial_type,
                                data_key=index_name,
                                data_value=float(value) if value else None,
                                data_unit="万元"  # Assuming the unit is 10,000 RMB
                            )
                            db.add(financial_data)

                        saved_count += 1

        db.commit()

        return {
            "message": f"Financial data synchronized successfully",
            "saved_records": saved_count,
            "financial_type": financial_type,
            "stock_code": ts_code
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

def fetch_financial_data(ts_code: str, financial_type: str, db: Session):
    """Helper function to fetch financial data from database"""
    # Verify stock exists
    stock = db.query(models.Stock).filter(models.Stock.ts_code == ts_code).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    # Get financial data from database
    financial_data = db.query(models.FinancialData).filter(
        models.FinancialData.ts_code == ts_code,
        models.FinancialData.financial_type == financial_type
    ).all()

    if not financial_data:
        # Try to sync data if not available
        raise HTTPException(status_code=404, detail="Financial data not available. Please sync first.")

    # Organize data by report type and date
    organized_data = {}
    for item in financial_data:
        if item.report_type not in organized_data:
            organized_data[item.report_type] = {}

        if item.report_date not in organized_data[item.report_type]:
            organized_data[item.report_type][item.report_date] = {}

        organized_data[item.report_type][item.report_date][item.data_key] = {
            "value": item.data_value,
            "unit": item.data_unit
        }

    return {
        "stock": {
            "ts_code": stock.ts_code,
            "symbol": stock.symbol,
            "name": stock.name
        },
        "financial_type": financial_type,
        "data": organized_data
    }

@router.get("/{ts_code}/overview")
def get_financial_overview(
    ts_code: str,
    db: Session = Depends(get_db)
):
    """Get financial overview with key metrics"""
    # Get main indicators
    indicators = db.query(models.FinancialData).filter(
        models.FinancialData.ts_code == ts_code,
        models.FinancialData.financial_type == "main_indicators"
    ).all()

    # Extract key metrics
    key_metrics = {}
    for indicator in indicators:
        if indicator.data_key in ["基本每股收益", "每股净资产", "净利润增长率", "营业总收入增长率", "加权净资产收益率"]:
            key_metrics[indicator.data_key] = {
                "value": indicator.data_value,
                "unit": indicator.data_unit,
                "report_date": indicator.report_date
            }

    return {
        "stock": {
            "ts_code": ts_code,
            "symbol": db.query(models.Stock).filter(models.Stock.ts_code == ts_code).first().symbol,
            "name": db.query(models.Stock).filter(models.Stock.ts_code == ts_code).first().name
        },
        "key_metrics": key_metrics
    }