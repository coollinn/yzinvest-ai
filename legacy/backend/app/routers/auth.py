from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict

from ..database import get_db
from .. import schemas, auth

router = APIRouter(prefix="/api/auth", tags=["authentication"])

@router.post("/register", response_model=schemas.LoginResponse)
def register(user: schemas.RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check if username already exists
    if auth.get_user_by_username(db, user.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    # Check if email already exists
    if auth.get_user_by_email(db, user.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create user
    db_user = auth.create_user(db, user)

    # Create session
    session = auth.create_session(db, db_user.id)

    return {
        "message": "User registered successfully",
        "session_token": session.session_token,
        "user_id": db_user.id,
        "username": db_user.username,
        "expires_at": session.expires_at
    }

@router.post("/login", response_model=schemas.LoginResponse)
def login(login_data: schemas.LoginRequest, db: Session = Depends(get_db)):
    """Login user"""
    user = auth.authenticate_user(db, login_data.username, login_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )

    # Create session
    session = auth.create_session(db, user.id)

    return {
        "message": "Login successful",
        "session_token": session.session_token,
        "user_id": user.id,
        "username": user.username,
        "expires_at": session.expires_at
    }

@router.post("/logout")
def logout(session_token: str = None, db: Session = Depends(get_db)):
    """Logout user"""
    if session_token:
        auth.delete_session(db, session_token)

    return {"message": "Logout successful"}

@router.get("/validate", response_model=schemas.SessionValidationResponse)
def validate_session(session_token: str, db: Session = Depends(get_db)):
    """Validate session"""
    return auth.validate_session(db, session_token)