from typing import List, Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.maintenance_log import (
    get_filtered_maintenance_logs, get_maintenance_log,
    update_maintenance_log, delete_maintenance_log
)
from app.schemas import MaintenanceLogRead, MaintenanceLogUpdate
from app.database import get_db

router = APIRouter(
    prefix="/maintenance_logs",
    tags=["Maintenance Logs"]
)

@router.get("/", response_model=List[MaintenanceLogRead])
async def list_maintenance_logs_route(
    vehicle_id: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    min_mileage: Optional[int] = Query(None),
    max_mileage: Optional[int] = Query(None),
    service_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieves a list of maintenance logs, with optional filters.
    """
    return await get_filtered_maintenance_logs(
        db=db,
        vehicle_id=vehicle_id,
        start_date=start_date,
        end_date=end_date,
        min_mileage=min_mileage,
        max_mileage=max_mileage,
        service_type=service_type,
    )

@router.get("/{log_id}", response_model=MaintenanceLogRead)
async def read_maintenance_log_route(log_id: int, db: AsyncSession = Depends(get_db)):
    """
    Retrieves a single maintenance log by its ID, with full details.
    """
    # The CRUD function raises a 404 if the log is not found.
    return await get_maintenance_log(db=db, log_id=log_id)

@router.put("/{log_id}", response_model=MaintenanceLogRead)
async def update_log_route(log_id: int, log_data: MaintenanceLogUpdate, db: AsyncSession = Depends(get_db)):
    """
    Updates an existing maintenance log's details and/or its custom field values.
    """
    await update_maintenance_log(db=db, log_id=log_id, log_data=log_data)
    await db.commit()
    
    # Re-fetch the fully detailed log to ensure the response model is correctly populated
    updated_log = await get_maintenance_log(db, log_id)
    return updated_log

@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_log_route(log_id: int, db: AsyncSession = Depends(get_db)):
    """
    Deletes a specific maintenance log by its ID.
    """
    # The CRUD function will raise a 404 if the log is not found.
    await delete_maintenance_log(db=db, log_id=log_id)
    await db.commit()
    return