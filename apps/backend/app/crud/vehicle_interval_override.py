from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload # If you need to load related Vehicle/ServiceType
from typing import List, Optional

from app.models.base import Vehicle, ServiceType, VehicleServiceIntervalOverride
from app.schemas import (
    VehicleServiceIntervalOverrideCreate,
    VehicleServiceIntervalOverrideUpdate,
    VehicleServiceIntervalOverrideRead # Not directly returned by all CRUD, but good for context
)
from fastapi import HTTPException, status

# Consistent error messages
VEHICLE_NOT_FOUND = "Vehicle not found"
SERVICE_TYPE_NOT_FOUND = "Service type not found"
OVERRIDE_NOT_FOUND = "Vehicle-specific interval override not found"


async def create_or_update_vehicle_interval_override(
    db: AsyncSession,
    vehicle_id: int,
    service_type_id: int,
    override_data: VehicleServiceIntervalOverrideCreate # Or Update, as base is same
) -> VehicleServiceIntervalOverride:
    """
    Creates a new vehicle-specific interval override or updates it if it already exists (upsert).
    """
    # 1. Check if Vehicle and ServiceType exist
    vehicle = await db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICLE_NOT_FOUND)

    service_type = await db.get(ServiceType, service_type_id)
    if not service_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=SERVICE_TYPE_NOT_FOUND)

    # 2. Try to get existing override
    stmt = select(VehicleServiceIntervalOverride).where(
        VehicleServiceIntervalOverride.vehicle_id == vehicle_id,
        VehicleServiceIntervalOverride.service_type_id == service_type_id
    )
    result = await db.execute(stmt)
    db_override = result.scalar_one_or_none()

    if db_override:
        # Update existing override
        # Using model_dump to get only provided fields from the pydantic model
        update_data_dict = override_data.model_dump(exclude_unset=True)
        if "override_interval_km" in update_data_dict: # Check if field was provided
            db_override.override_interval_km = update_data_dict["override_interval_km"]
        if "override_interval_days" in update_data_dict: # Check if field was provided
            db_override.override_interval_days = update_data_dict["override_interval_days"]
        # If both are set to null by the update, the record might be redundant,
        # but we'll keep it to signify an explicit "no override" if that's the desired logic.
        # Alternatively, if both become null, you could delete the override record.
    else:
        # Create new override
        db_override = VehicleServiceIntervalOverride(
            vehicle_id=vehicle_id,
            service_type_id=service_type_id,
            override_interval_km=override_data.override_interval_km,
            override_interval_days=override_data.override_interval_days
        )
        db.add(db_override)

    try:
        await db.commit()
        await db.refresh(db_override)
    except Exception as e: # Catch potential commit errors (like unique constraint if race condition)
        await db.rollback()
        # Consider more specific error for unique constraint violation if not an upsert
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {e}")
    
    return db_override


async def get_vehicle_interval_override(
    db: AsyncSession,
    vehicle_id: int,
    service_type_id: int
) -> Optional[VehicleServiceIntervalOverride]:
    """
    Fetches a specific interval override for a vehicle and service type.
    Returns None if not found (the route handler can then raise 404).
    """
    stmt = select(VehicleServiceIntervalOverride).where(
        VehicleServiceIntervalOverride.vehicle_id == vehicle_id,
        VehicleServiceIntervalOverride.service_type_id == service_type_id
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_all_overrides_for_vehicle(
    db: AsyncSession,
    vehicle_id: int
) -> List[VehicleServiceIntervalOverride]:
    """
    Lists all interval overrides for a specific vehicle.
    """
    # Optional: Check if vehicle exists
    vehicle = await db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICLE_NOT_FOUND)

    stmt = select(VehicleServiceIntervalOverride).where(
        VehicleServiceIntervalOverride.vehicle_id == vehicle_id
    )
    # Optionally load related service_type name for better display if needed in response
    # stmt = stmt.options(selectinload(VehicleServiceIntervalOverride.service_type))
    
    result = await db.execute(stmt)
    return result.scalars().all()


async def delete_vehicle_interval_override(
    db: AsyncSession,
    vehicle_id: int,
    service_type_id: int
) -> None: # Returns None on success, raises error if not found
    """
    Deletes a specific interval override.
    If the override doesn't exist, it raises a 404 error.
    """
    db_override = await get_vehicle_interval_override(db, vehicle_id, service_type_id)
    
    if not db_override:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=OVERRIDE_NOT_FOUND)

    await db.delete(db_override)
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {e}")

    return # Implicit None on success