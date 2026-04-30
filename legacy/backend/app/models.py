from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import datetime

Base = declarative_base()

class Stock(Base):
    __tablename__ = "stocks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ts_code = Column(String(20), unique=True, nullable=False)
    symbol = Column(String(10), nullable=False)
    name = Column(String(100), nullable=False)
    area = Column(String(50))
    industry = Column(String(100))
    fullname = Column(String(200))
    enname = Column(String(200))
    cnspell = Column(String(100))
    market = Column(String(20))
    exchange = Column(String(10))
    curr_type = Column(String(10))
    list_status = Column(String(1))
    list_date = Column(String(8))
    delist_date = Column(String(8))
    is_hs = Column(String(1))
    act_name = Column(String(100))
    act_ent_type = Column(String(50))
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    daily_data = relationship("StockDaily", back_populates="stock")
    notes = relationship("Note", back_populates="stock")
    favorites = relationship("Favorite", back_populates="stock")
    financial_data = relationship("FinancialData", back_populates="stock")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100))
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    sessions = relationship("Session", back_populates="user")
    notes = relationship("Note", back_populates="user")
    favorites = relationship("Favorite", back_populates="user")

class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_token = Column(String(255), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    user = relationship("User", back_populates="sessions")

class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    stock_id = Column(Integer, ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    analysis_type = Column(String(20))  # DCF, CAPM, Technical, Fundamental, Other
    rating = Column(Integer)  # 1-5 stars
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="notes")
    stock = relationship("Stock", back_populates="notes")

class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    stock_id = Column(Integer, ForeignKey("stocks.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    user = relationship("User", back_populates="favorites")
    stock = relationship("Stock", back_populates="favorites")

class StockDaily(Base):
    __tablename__ = "stock_daily"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ts_code = Column(String(20), ForeignKey("stocks.ts_code", ondelete="CASCADE"), nullable=False)
    trade_date = Column(String(8), nullable=False)  # YYYYMMDD
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    pre_close = Column(Float)
    change = Column(Float)
    pct_chg = Column(Float)
    vol = Column(Float)  # Volume in shares
    amount = Column(Float)  # Amount in thousands
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    stock = relationship("Stock", back_populates="daily_data")

class FinancialData(Base):
    __tablename__ = "financial_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ts_code = Column(String(20), ForeignKey("stocks.ts_code", ondelete="CASCADE"), nullable=False)
    report_type = Column(String(10), nullable=False)  # year, middle, one, three
    report_date = Column(String(10), nullable=False)  # YYYY-MM-DD
    financial_type = Column(String(50), nullable=False)  # balance_sheet, income_statement, cash_flow, main_indicators
    data_key = Column(String(50), nullable=False)  # e.g., "货币资金", "营业总收入"
    data_value = Column(Float)
    data_unit = Column(String(10))  # e.g., "万元", "元"
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    stock = relationship("Stock", back_populates="financial_data")