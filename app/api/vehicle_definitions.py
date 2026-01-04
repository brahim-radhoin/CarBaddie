from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import distinct, select
from typing import List, Optional

from app.database import get_db
from app.models.vehicle_definitions import VehicleDefinition

router = APIRouter(prefix="/vehicle-definitions", tags=["vehicle-definitions"])

@router.get("/years", response_model=List[int])
async def get_years(
    make: Optional[str] = Query(None, description="Filter by Make"),
    model: Optional[str] = Query(None, description="Filter by Model"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get unique years. 
    If make/model provided, filters years for that make/model.
    """
    stmt = select(distinct(VehicleDefinition.year))
    
    if make:
        stmt = stmt.filter(VehicleDefinition.make == make)
    if model:
        stmt = stmt.filter(VehicleDefinition.model == model)
        
    stmt = stmt.order_by(VehicleDefinition.year.desc())
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/makes", response_model=List[str])
async def get_makes(
    year: Optional[int] = Query(None, description="Filter by Year"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get unique makes.
    If year provided, filters makes available in that year.
    """
    stmt = select(distinct(VehicleDefinition.make))
    
    if year:
        stmt = stmt.filter(VehicleDefinition.year == year)
        
    stmt = stmt.order_by(VehicleDefinition.make.asc())
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/models", response_model=List[str])
async def get_models(
    make: str = Query(..., description="Filter by Make"),
    year: Optional[int] = Query(None, description="Filter by Year"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get models for a specific make.
    If year provided, filters models available in that year.
    """
    stmt = select(distinct(VehicleDefinition.model))
    stmt = stmt.filter(VehicleDefinition.make == make)
    
    if year:
        stmt = stmt.filter(VehicleDefinition.year == year)
        
    stmt = stmt.order_by(VehicleDefinition.model.asc())
    
    result = await db.execute(stmt)
    return result.scalars().all()
