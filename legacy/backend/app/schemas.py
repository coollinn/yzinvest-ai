from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# Base schemas
class StockBase(BaseModel):
    ts_code: str
    symbol: str
    name: str
    area: Optional[str] = None
    industry: Optional[str] = None
    fullname: Optional[str] = None
    enname: Optional[str] = None
    cnspell: Optional[str] = None
    market: Optional[str] = None
    exchange: Optional[str] = None
    curr_type: Optional[str] = None
    list_status: Optional[str] = None
    list_date: Optional[str] = None
    delist_date: Optional[str] = None
    is_hs: Optional[str] = None
    act_name: Optional[str] = None
    act_ent_type: Optional[str] = None

class StockCreate(StockBase):
    pass

class Stock(StockBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class SessionBase(BaseModel):
    session_token: str
    expires_at: datetime

class Session(SessionBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class NoteBase(BaseModel):
    content: str
    analysis_type: Optional[str] = None
    rating: Optional[int] = None

class NoteCreate(NoteBase):
    stock_id: int

class Note(NoteBase):
    id: int
    user_id: int
    stock_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class FavoriteBase(BaseModel):
    stock_id: int

class Favorite(FavoriteBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class StockDailyBase(BaseModel):
    ts_code: str
    trade_date: str
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: Optional[float] = None
    pre_close: Optional[float] = None
    change: Optional[float] = None
    pct_chg: Optional[float] = None
    vol: Optional[float] = None
    amount: Optional[float] = None

class StockDaily(StockDailyBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Response schemas
class LoginResponse(BaseModel):
    message: str
    session_token: str
    user_id: int
    username: str
    expires_at: datetime

class SessionValidationResponse(BaseModel):
    valid: bool
    user_id: Optional[int] = None
    expires_at: Optional[datetime] = None

class Pagination(BaseModel):
    current_page: int
    total_pages: int
    total_items: int
    items_per_page: int
    has_next: bool
    has_prev: bool

class StockListResponse(BaseModel):
    stocks: List[Stock]
    pagination: Pagination

class StockSearchResponse(BaseModel):
    stocks: List[Stock]
    query: str
    count: int

class StockRandomResponse(BaseModel):
    stocks: List[Stock]
    count: int
    type: str

class StockDetailResponse(BaseModel):
    stock: Stock
    analysis_data: dict
    has_real_data: bool
    has_financial_data: bool

class NoteListResponse(BaseModel):
    notes: List[Note]
    pagination: Pagination

class FavoriteListResponse(BaseModel):
    favorites: List[Favorite]

class FavoriteCheckResponse(BaseModel):
    is_favorite: bool

class DailyDataResponse(BaseModel):
    data: List[StockDaily]
    source: str
    count: int

class AdminDashboardResponse(BaseModel):
    user_stats: dict
    system_stats: dict

# Authentication schemas
class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None