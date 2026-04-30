from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from .. import schemas, models, auth

router = APIRouter(prefix="/api/favorites", tags=["favorites"])

@router.get("/", response_model=schemas.FavoriteListResponse)
def get_user_favorites(
    session_token: str = Query(..., alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Get user's favorite stocks"""
    # Get current user
    user = auth.get_current_user(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get favorites with stock information
    favorites = db.query(models.Favorite).filter(
        models.Favorite.user_id == user.id
    ).all()

    return {"favorites": favorites}

@router.post("/", response_model=schemas.Favorite)
def add_favorite(
    favorite_data: schemas.FavoriteBase,
    session_token: str = Query(..., alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Add a stock to favorites"""
    # Get current user
    user = auth.get_current_user(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Verify stock exists
    stock = db.query(models.Stock).filter(models.Stock.id == favorite_data.stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    # Check if already favorited
    existing_favorite = db.query(models.Favorite).filter(
        models.Favorite.user_id == user.id,
        models.Favorite.stock_id == favorite_data.stock_id
    ).first()

    if existing_favorite:
        raise HTTPException(status_code=400, detail="Stock already in favorites")

    # Create favorite
    favorite = models.Favorite(
        user_id=user.id,
        stock_id=favorite_data.stock_id
    )

    db.add(favorite)
    db.commit()
    db.refresh(favorite)

    return favorite

@router.delete("/{stock_id}")
def remove_favorite(
    stock_id: int,
    session_token: str = Query(..., alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Remove a stock from favorites"""
    # Get current user
    user = auth.get_current_user(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get favorite
    favorite = db.query(models.Favorite).filter(
        models.Favorite.user_id == user.id,
        models.Favorite.stock_id == stock_id
    ).first()

    if not favorite:
        raise HTTPException(status_code=404, detail="Favorite not found")

    # Delete favorite
    db.delete(favorite)
    db.commit()

    return {"message": "Favorite removed successfully"}

@router.get("/{stock_id}/check", response_model=schemas.FavoriteCheckResponse)
def check_favorite(
    stock_id: int,
    session_token: str = Query(..., alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Check if a stock is in user's favorites"""
    # Get current user
    user = auth.get_current_user(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Check if favorited
    favorite = db.query(models.Favorite).filter(
        models.Favorite.user_id == user.id,
        models.Favorite.stock_id == stock_id
    ).first()

    return {"is_favorite": favorite is not None}