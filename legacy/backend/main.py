from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from dotenv import load_dotenv

from app.database import init_db
from app.routers import auth, stocks, notes, favorites, daily, admin, financial

# Load environment variables
load_dotenv()

# Create FastAPI app
app = FastAPI(
    title="YZInvest AI API",
    description="智能股票分析平台后端API",
    version="1.0.0"
)

# Configure CORS - allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(stocks.router)
app.include_router(notes.router)
app.include_router(favorites.router)
app.include_router(daily.router)
app.include_router(admin.router)
app.include_router(financial.router)

@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    init_db()
    print("YZInvest AI Backend started successfully")

@app.get("/")
async def root():
    return {
        "message": "YZInvest AI Backend API",
        "version": "1.0.0",
        "docs": "/docs"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)