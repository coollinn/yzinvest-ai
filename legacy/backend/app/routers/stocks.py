from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import random

from ..database import get_db
from .. import schemas, models, auth

router = APIRouter(prefix="/api/stocks", tags=["stocks"])

def get_current_user_optional(
    session_token: Optional[str] = Query(None, alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Optional dependency for getting current user (if session token provided)"""
    if session_token:
        return auth.get_current_user(db, session_token)
    return None

@router.get("/", response_model=schemas.StockListResponse)
def get_stocks(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get paginated list of stocks"""
    # Calculate offset
    offset = (page - 1) * limit

    # Get total count
    total_items = db.query(models.Stock).count()

    # Get stocks for current page
    stocks = db.query(models.Stock).offset(offset).limit(limit).all()

    # Calculate pagination info
    total_pages = (total_items + limit - 1) // limit

    return {
        "stocks": stocks,
        "pagination": {
            "current_page": page,
            "total_pages": total_pages,
            "total_items": total_items,
            "items_per_page": limit,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }

@router.get("/search", response_model=schemas.StockSearchResponse)
def search_stocks(
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Search stocks by symbol, name, or industry"""
    search_term = f"%{q}%"

    stocks = db.query(models.Stock).filter(
        (models.Stock.symbol.ilike(search_term)) |
        (models.Stock.name.ilike(search_term)) |
        (models.Stock.industry.ilike(search_term)) |
        (models.Stock.cnspell.ilike(search_term))
    ).limit(limit).all()

    return {
        "stocks": stocks,
        "query": q,
        "count": len(stocks)
    }

@router.get("/random", response_model=schemas.StockRandomResponse)
def get_random_stocks(
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """Get random stocks"""
    # Get all stock IDs
    all_stocks = db.query(models.Stock).all()

    # If we have fewer stocks than requested limit, return all
    if len(all_stocks) <= limit:
        return {
            "stocks": all_stocks,
            "count": len(all_stocks),
            "type": "all_available"
        }

    # Otherwise, select random samples
    random_stocks = random.sample(all_stocks, limit)

    return {
        "stocks": random_stocks,
        "count": limit,
        "type": "random_by_industry"
    }

@router.get("/{identifier}")
def get_stock(
    identifier: str,
    db: Session = Depends(get_db)
):
    """Get stock by ID or ts_code"""
    # Try to get by ID first (if identifier is numeric)
    if identifier.isdigit():
        stock = db.query(models.Stock).filter(models.Stock.id == int(identifier)).first()
    else:
        # Try to get by ts_code
        stock = db.query(models.Stock).filter(models.Stock.ts_code == identifier).first()

    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    return {"stock": stock}

@router.get("/{identifier}/detail", response_model=schemas.StockDetailResponse)
def get_stock_detail(
    identifier: str,
    db: Session = Depends(get_db)
):
    """Get detailed stock information with analysis data"""
    # Get stock
    if identifier.isdigit():
        stock = db.query(models.Stock).filter(models.Stock.id == int(identifier)).first()
    else:
        stock = db.query(models.Stock).filter(models.Stock.ts_code == identifier).first()

    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    # Get latest daily data
    latest_daily = db.query(models.StockDaily).filter(
        models.StockDaily.ts_code == stock.ts_code
    ).order_by(models.StockDaily.trade_date.desc()).first()

    # Get financial data count
    financial_data_count = db.query(models.FinancialData).filter(
        models.FinancialData.ts_code == stock.ts_code
    ).count()

    # Mock analysis data (in real implementation, this would come from calculations)
    analysis_data = {
        "current_price": latest_daily.close if latest_daily else 0,
        "price_change": latest_daily.pct_chg if latest_daily else 0,
        "market_cap": 0,  # Would need market cap data
        "pe_ratio": 12.5,  # Mock data
        "volume": latest_daily.vol if latest_daily else 0,
        "beta": 1.2,  # Mock data
        "dividend_yield": 0.03,  # Mock data
        "eps": 1.26,  # Mock data
        "roe": 0.15,  # Mock data
        "roa": 0.08   # Mock data
    }

    return {
        "stock": stock,
        "analysis_data": analysis_data,
        "has_real_data": latest_daily is not None,
        "has_financial_data": financial_data_count > 0
    }

@router.get("/{identifier}/user-note")
def get_user_stock_note(
    identifier: str,
    session_token: str = Query(..., alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Get user's note for a specific stock"""
    # Get current user
    user = auth.get_current_user(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get stock
    if identifier.isdigit():
        stock = db.query(models.Stock).filter(models.Stock.id == int(identifier)).first()
    else:
        stock = db.query(models.Stock).filter(models.Stock.ts_code == identifier).first()

    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    # Get user's note for this stock
    note = db.query(models.Note).filter(
        models.Note.user_id == user.id,
        models.Note.stock_id == stock.id
    ).first()

    return {"note": note}