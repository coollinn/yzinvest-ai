from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional

from ..database import get_db
from .. import schemas, models

router = APIRouter(prefix="/api/daily", tags=["daily data"])

@router.get("/{ts_code}", response_model=schemas.DailyDataResponse)
def get_daily_data(
    ts_code: str,
    start_date: Optional[str] = Query(None, regex=r'^\d{8}$'),
    end_date: Optional[str] = Query(None, regex=r'^\d{8}$'),
    limit: int = Query(10, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get daily stock data for a specific stock"""
    # Verify stock exists
    stock = db.query(models.Stock).filter(models.Stock.ts_code == ts_code).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    # Build query
    query = db.query(models.StockDaily).filter(
        models.StockDaily.ts_code == ts_code
    )

    # Apply date filters
    if start_date:
        query = query.filter(models.StockDaily.trade_date >= start_date)
    if end_date:
        query = query.filter(models.StockDaily.trade_date <= end_date)

    # Order by date descending and limit
    data = query.order_by(models.StockDaily.trade_date.desc()).limit(limit).all()

    return {
        "data": data,
        "source": "database",
        "count": len(data)
    }

@router.get("/latest", response_model=schemas.DailyDataResponse)
def get_latest_daily_data(
    db: Session = Depends(get_db)
):
    """Get latest daily data for all stocks"""
    # Get the latest trade date
    latest_date_record = db.query(models.StockDaily.trade_date).order_by(
        models.StockDaily.trade_date.desc()
    ).first()

    if not latest_date_record:
        raise HTTPException(status_code=404, detail="No daily data available")

    latest_date = latest_date_record[0]

    # Get data for the latest date
    data = db.query(models.StockDaily).filter(
        models.StockDaily.trade_date == latest_date
    ).all()

    return {
        "trade_date": latest_date,
        "data": data,
        "count": len(data)
    }