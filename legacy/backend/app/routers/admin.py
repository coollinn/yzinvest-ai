from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
import requests
import os

from ..database import get_db
from .. import schemas, models, auth

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Tushare API configuration
TUSHARE_TOKEN = os.getenv("TUSHARE_TOKEN", "640b213ec19b805745b1cfebfaa923b60534389a43276302d065e623")
TUSHARE_URL = "https://api.tushare.pro"

def call_tushare_api(api_name: str, params: dict):
    """Call Tushare API"""
    payload = {
        "api_name": api_name,
        "token": TUSHARE_TOKEN,
        "params": params
    }

    response = requests.post(TUSHARE_URL, json=payload)
    return response.json()

@router.get("/dashboard", response_model=schemas.AdminDashboardResponse)
def get_admin_dashboard(
    session_token: str = Query(..., alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Get admin dashboard statistics"""
    # Get current user (basic auth check)
    user = auth.get_current_user(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # TODO: Add admin role check in production

    # Get user statistics
    total_users = db.query(models.User).count()
    active_sessions = db.query(models.Session).filter(
        models.Session.expires_at > func.now()
    ).count()
    total_notes = db.query(models.Note).count()
    total_favorites = db.query(models.Favorite).count()

    # Get system statistics
    total_stocks = db.query(models.Stock).count()

    return {
        "user_stats": {
            "total_users": total_users,
            "active_sessions": active_sessions,
            "total_notes": total_notes,
            "total_favorites": total_favorites
        },
        "system_stats": {
            "total_stocks": total_stocks
        }
    }

@router.get("/users")
def get_users(
    session_token: str = Query(..., alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Get all users (admin only)"""
    # Get current user (basic auth check)
    user = auth.get_current_user(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # TODO: Add admin role check in production

    users = db.query(models.User).all()
    return {"users": users}

@router.post("/sync/stocks")
def sync_stocks(
    session_token: str = Query(..., alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Sync stock data from Tushare API"""
    # Get current user (basic auth check)
    user = auth.get_current_user(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # TODO: Add admin role check in production

    try:
        # Call Tushare stock_basic API
        result = call_tushare_api("stock_basic", {
            "exchange": "",
            "list_status": "L",
            "fields": "ts_code,symbol,name,area,industry,fullname,enname,cnspell,market,exchange,curr_type,list_status,list_date,delist_date,is_hs,act_name,act_ent_type"
        })

        if result["code"] != 0:
            raise HTTPException(status_code=400, detail=f"Tushare API error: {result['msg']}")

        stocks_data = result["data"]["items"]
        synced_count = 0

        for stock_data in stocks_data:
            ts_code = stock_data[0]

            # Check if stock already exists
            existing_stock = db.query(models.Stock).filter(models.Stock.ts_code == ts_code).first()

            if existing_stock:
                # Update existing stock
                existing_stock.symbol = stock_data[1]
                existing_stock.name = stock_data[2]
                existing_stock.area = stock_data[3]
                existing_stock.industry = stock_data[4]
                existing_stock.fullname = stock_data[5]
                existing_stock.enname = stock_data[6]
                existing_stock.cnspell = stock_data[7]
                existing_stock.market = stock_data[8]
                existing_stock.exchange = stock_data[9]
                existing_stock.curr_type = stock_data[10]
                existing_stock.list_status = stock_data[11]
                existing_stock.list_date = stock_data[12]
                existing_stock.delist_date = stock_data[13]
                existing_stock.is_hs = stock_data[14]
                existing_stock.act_name = stock_data[15]
                existing_stock.act_ent_type = stock_data[16]
            else:
                # Create new stock
                stock = models.Stock(
                    ts_code=ts_code,
                    symbol=stock_data[1],
                    name=stock_data[2],
                    area=stock_data[3],
                    industry=stock_data[4],
                    fullname=stock_data[5],
                    enname=stock_data[6],
                    cnspell=stock_data[7],
                    market=stock_data[8],
                    exchange=stock_data[9],
                    curr_type=stock_data[10],
                    list_status=stock_data[11],
                    list_date=stock_data[12],
                    delist_date=stock_data[13],
                    is_hs=stock_data[14],
                    act_name=stock_data[15],
                    act_ent_type=stock_data[16]
                )
                db.add(stock)

            synced_count += 1

        db.commit()

        return {"message": f"Stock data synchronized successfully. Processed {synced_count} stocks."}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")