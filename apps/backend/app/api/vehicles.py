from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError 

# Correctly import the get_maintenance_log function
from app.crud.maintenance_log import (
    create_maintenance_log, get_logs_for_vehicle, get_maintenance_summary,
    get_maintenance_summary_by_service_type, get_maintenance_log
)
from app.crud.vehicle import create_vehicle, get_vehicle, get_vehicles, update_vehicle, delete_vehicle
from app.crud.vehicle_interval_override import (
    create_or_update_vehicle_interval_override, delete_vehicle_interval_override,
    get_all_overrides_for_vehicle
)

from app.schemas import (
    VehicleCreate, VehicleRead, VehicleUpdate, MaintenanceLogCreate, MaintenanceLogRead,
    MaintenanceSummary, ServiceTypeLogSummary, VehicleServiceIntervalOverrideUpdate,
    VehicleServiceIntervalOverrideRead
)
from app.database import get_db

# Consistent error messages
VEHICLE_NOT_FOUND = "Vehicle not found"

router = APIRouter(
    prefix="/vehicles",
    tags=["Vehicles"]
)

@router.post("/", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
async def add_vehicle_route(vehicle_data: VehicleCreate, db: AsyncSession = Depends(get_db)):
    """
    Creates a new vehicle. Handles potential duplicate VINs gracefully.
    """
    try:
        # The CRUD function stages the new vehicle
        new_vehicle = await create_vehicle(db=db, vehicle_data=vehicle_data)
        # The commit will fail if the database's UNIQUE constraint is violated
        await db.commit()
    except IntegrityError:
        # If a DB-level integrity error occurs (like a unique constraint fail),
        # it means our initial check failed due to a race condition.
        # We must rollback the session and then raise the correct HTTP 409 error.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A vehicle with VIN '{vehicle_data.vin}' already exists."
        )
    
    # Re-fetch the fully loaded object for the response model
    created_vehicle = await get_vehicle(db, new_vehicle.id)
    return created_vehicle

@router.get("/", response_model=List[VehicleRead])
async def list_vehicles_route(db: AsyncSession = Depends(get_db)):
    return await get_vehicles(db)

@router.get("/{vehicle_id}", response_model=VehicleRead)
async def read_vehicle_route(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    db_vehicle = await get_vehicle(db, vehicle_id)
    if not db_vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICLE_NOT_FOUND)
    return db_vehicle


@router.put("/{vehicle_id}", response_model=VehicleRead)
async def update_vehicle_route(vehicle_id: int, vehicle_data: VehicleUpdate, db: AsyncSession = Depends(get_db)):
    """
    Updates an existing vehicle.
    """
    # The update CRUD function already has a robust check that is less prone to this specific race condition.
    # However, adding a try/except here as well would make it even more robust.
    try:
        updated_vehicle_staging = await update_vehicle(db, vehicle_id, vehicle_data)
        if not updated_vehicle_staging:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"VIN '{vehicle_data.vin}' already exists for another vehicle."
        )

    updated_vehicle = await get_vehicle(db, updated_vehicle_staging.id)
    return updated_vehicle
  
@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vehicle_route(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    await delete_vehicle(db, vehicle_id)
    await db.commit()
    return

# --- Nested Maintenance Log Routes ---

@router.post("/{vehicle_id}/logs/", response_model=MaintenanceLogRead, status_code=status.HTTP_201_CREATED, tags=["Maintenance Logs"])
async def add_maintenance_log_for_vehicle(vehicle_id: int, log_data: MaintenanceLogCreate, db: AsyncSession = Depends(get_db)):
    new_log = await create_maintenance_log(db, log_data, vehicle_id)
    await db.commit()
    # Re-fetch the fully detailed log for the response
    return await get_maintenance_log(db, new_log.id)

@router.get("/{vehicle_id}/logs/", response_model=List[MaintenanceLogRead], tags=["Maintenance Logs"])
async def get_logs_by_vehicle_route(vehicle_id: int, service_type_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    return await get_logs_for_vehicle(db, vehicle_id, service_type_id)

@router.get("/{vehicle_id}/logs/summary", response_model=MaintenanceSummary, tags=["Maintenance Logs"])
async def get_maintenance_summary_route(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    return await get_maintenance_summary(db, vehicle_id)

# --- CORRECTED ROUTE ---
@router.get("/{vehicle_id}/maintenance_summary_by_type", response_model=List[ServiceTypeLogSummary], tags=["Maintenance Logs"])
async def get_maintenance_summary_by_type_route(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    """
    Retrieves a summary of maintenance logs for a specific vehicle, grouped by service type.
    """
    return await get_maintenance_summary_by_service_type(db=db, vehicle_id=vehicle_id)

# --- Nested Interval Override Routes ---

@router.put("/{vehicle_id}/interval_overrides/{service_type_id}", response_model=VehicleServiceIntervalOverrideRead, tags=["Vehicle Interval Overrides"])
async def upsert_override_route(vehicle_id: int, service_type_id: int, override_data: VehicleServiceIntervalOverrideUpdate, db: AsyncSession = Depends(get_db)):
    override = await create_or_update_vehicle_interval_override(db, vehicle_id, service_type_id, override_data)
    await db.commit()
    return override

@router.get("/{vehicle_id}/interval_overrides/", response_model=List[VehicleServiceIntervalOverrideRead], tags=["Vehicle Interval Overrides"])
async def list_overrides_for_vehicle_route(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    return await get_all_overrides_for_vehicle(db, vehicle_id=vehicle_id)

@router.delete("/{vehicle_id}/interval_overrides/{service_type_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Vehicle Interval Overrides"])
async def remove_override_route(vehicle_id: int, service_type_id: int, db: AsyncSession = Depends(get_db)):
    await delete_vehicle_interval_override(db, vehicle_id, service_type_id)
    await db.commit()
    return