from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from .. import schemas, models, auth

router = APIRouter(prefix="/api/notes", tags=["notes"])

@router.get("/", response_model=schemas.NoteListResponse)
def get_user_notes(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session_token: str = Query(..., alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Get paginated list of user's notes"""
    # Get current user
    user = auth.get_current_user(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Calculate offset
    offset = (page - 1) * limit

    # Get total count
    total_items = db.query(models.Note).filter(models.Note.user_id == user.id).count()

    # Get notes for current page
    notes = db.query(models.Note).filter(
        models.Note.user_id == user.id
    ).offset(offset).limit(limit).all()

    # Calculate pagination info
    total_pages = (total_items + limit - 1) // limit

    return {
        "notes": notes,
        "pagination": {
            "current_page": page,
            "total_pages": total_pages,
            "total_items": total_items,
            "items_per_page": limit,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }

@router.post("/", response_model=schemas.Note)
def create_note(
    note_data: schemas.NoteCreate,
    session_token: str = Query(..., alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Create a new note"""
    # Get current user
    user = auth.get_current_user(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Verify stock exists
    stock = db.query(models.Stock).filter(models.Stock.id == note_data.stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    # Check if note already exists for this stock
    existing_note = db.query(models.Note).filter(
        models.Note.user_id == user.id,
        models.Note.stock_id == note_data.stock_id
    ).first()

    if existing_note:
        # Update existing note
        existing_note.content = note_data.content
        existing_note.analysis_type = note_data.analysis_type
        existing_note.rating = note_data.rating
        db.commit()
        db.refresh(existing_note)
        return existing_note

    # Create new note
    note = models.Note(
        user_id=user.id,
        stock_id=note_data.stock_id,
        content=note_data.content,
        analysis_type=note_data.analysis_type,
        rating=note_data.rating
    )

    db.add(note)
    db.commit()
    db.refresh(note)

    return note

@router.get("/{note_id}", response_model=schemas.Note)
def get_note(
    note_id: int,
    session_token: str = Query(..., alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Get a specific note"""
    # Get current user
    user = auth.get_current_user(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get note
    note = db.query(models.Note).filter(
        models.Note.id == note_id,
        models.Note.user_id == user.id
    ).first()

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    return note

@router.put("/{note_id}", response_model=schemas.Note)
def update_note(
    note_id: int,
    note_data: schemas.NoteBase,
    session_token: str = Query(..., alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Update a note"""
    # Get current user
    user = auth.get_current_user(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get note
    note = db.query(models.Note).filter(
        models.Note.id == note_id,
        models.Note.user_id == user.id
    ).first()

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Update note
    note.content = note_data.content
    note.analysis_type = note_data.analysis_type
    note.rating = note_data.rating

    db.commit()
    db.refresh(note)

    return note

@router.delete("/{note_id}")
def delete_note(
    note_id: int,
    session_token: str = Query(..., alias="X-Session-Token"),
    db: Session = Depends(get_db)
):
    """Delete a note"""
    # Get current user
    user = auth.get_current_user(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get note
    note = db.query(models.Note).filter(
        models.Note.id == note_id,
        models.Note.user_id == user.id
    ).first()

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Delete note
    db.delete(note)
    db.commit()

    return {"message": "Note deleted successfully"}