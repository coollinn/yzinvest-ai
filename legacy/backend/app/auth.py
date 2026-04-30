from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
import secrets
from sqlalchemy.orm import Session
from . import models, schemas
import os

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT configuration (for session tokens)
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"
SESSION_EXPIRE_DAYS = 30

def verify_password(plain_password, hashed_password):
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    """Generate password hash"""
    return pwd_context.hash(password)

def create_session_token():
    """Create a random session token"""
    return secrets.token_urlsafe(32)

def create_session(db: Session, user_id: int):
    """Create a new session for user"""
    session_token = create_session_token()
    expires_at = datetime.utcnow() + timedelta(days=SESSION_EXPIRE_DAYS)

    session = models.Session(
        user_id=user_id,
        session_token=session_token,
        expires_at=expires_at
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    return session

def get_session(db: Session, session_token: str):
    """Get session by token"""
    return db.query(models.Session).filter(
        models.Session.session_token == session_token,
        models.Session.expires_at > datetime.utcnow()
    ).first()

def delete_session(db: Session, session_token: str):
    """Delete a session (logout)"""
    session = db.query(models.Session).filter(
        models.Session.session_token == session_token
    ).first()

    if session:
        db.delete(session)
        db.commit()

    return session

def get_user_by_username(db: Session, username: str):
    """Get user by username"""
    return db.query(models.User).filter(models.User.username == username).first()

def get_user_by_email(db: Session, email: str):
    """Get user by email"""
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate):
    """Create a new user"""
    hashed_password = get_password_hash(user.password)

    db_user = models.User(
        username=user.username,
        email=user.email,
        password_hash=hashed_password,
        full_name=user.full_name
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return db_user

def authenticate_user(db: Session, username: str, password: str):
    """Authenticate user with username and password"""
    user = get_user_by_username(db, username)
    if not user:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user

def get_current_user(db: Session, session_token: str):
    """Get current user from session token"""
    if not session_token:
        return None

    session = get_session(db, session_token)
    if not session:
        return None

    return db.query(models.User).filter(models.User.id == session.user_id).first()

def validate_session(db: Session, session_token: str):
    """Validate session and return user info"""
    session = get_session(db, session_token)
    if not session:
        return {"valid": False}

    return {
        "valid": True,
        "user_id": session.user_id,
        "expires_at": session.expires_at
    }