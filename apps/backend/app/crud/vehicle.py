from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload, selectinload
from typing import List, Optional

from app.models.base import Vehicle, MaintenanceLog, ServiceType, CustomFieldValue
from app.schemas import VehicleCreate, VehicleUpdate
from fastapi import HTTPException, status

# Consistent error messages
VEHICLE_NOT_FOUND = "Vehicle not found"


async def create_vehicle(db: AsyncSession, vehicle_data: VehicleCreate) -> Vehicle:
    """
    Creates a new vehicle instance in the session but does NOT commit.
    The caller (route handler) is responsible for the commit.
    """
    if vehicle_data.vin:  # Check the incoming data for potential VIN conflicts
        result = await db.execute(
            select(Vehicle.id).where(Vehicle.vin == vehicle_data.vin)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A vehicle with VIN '{vehicle_data.vin}' already exists."
            )

    db_vehicle = Vehicle(**vehicle_data.model_dump())
    db.add(db_vehicle)
    
    # Flush the session to get the ID for the new vehicle and check for immediate DB errors
    await db.flush()
    # Refresh the instance to load any DB-defaults or server-side changes
    await db.refresh(db_vehicle)
    
    return db_vehicle


async def get_vehicle(db: AsyncSession, vehicle_id: int) -> Optional[Vehicle]:
    """Gets a single vehicle by ID, ensuring all nested data needed for serialization is loaded."""
    result = await db.execute(
        select(Vehicle)
        .options(
            # Eagerly load all required relationships for the VehicleRead schema
            joinedload(Vehicle.maintenance_logs)
                .joinedload(MaintenanceLog.service_type)
                .joinedload(ServiceType.fields),

            joinedload(Vehicle.maintenance_logs)
                .joinedload(MaintenanceLog.custom_field_values)
                .joinedload(CustomFieldValue.custom_field),
                
            selectinload(Vehicle.interval_overrides)
        )
        .where(Vehicle.id == vehicle_id)
    )
    # unique() is needed to deduplicate parent (Vehicle) rows when using joinedload across collections
    return result.unique().scalar_one_or_none()


async def get_vehicles(db: AsyncSession) -> List[Vehicle]:
    """Gets all vehicles, ensuring all nested data needed for serialization is loaded."""
    result = await db.execute(
        select(Vehicle)
        .options(
            # Eagerly load all required relationships for the VehicleRead schema
            joinedload(Vehicle.maintenance_logs)
                .joinedload(MaintenanceLog.service_type)
                .joinedload(ServiceType.fields),

            joinedload(Vehicle.maintenance_logs)
                .joinedload(MaintenanceLog.custom_field_values)
                .joinedload(CustomFieldValue.custom_field),
                
            selectinload(Vehicle.interval_overrides) 
        )
        .order_by(Vehicle.make, Vehicle.model)
    )
    # unique() is needed to deduplicate parent (Vehicle) rows when using joinedload across collections
    return result.unique().scalars().all()


async def update_vehicle(db: AsyncSession, vehicle_id: int, vehicle_data: VehicleUpdate) -> Optional[Vehicle]:
    """
    Updates an existing vehicle instance in the session but does NOT commit.
    The caller (route handler) is responsible for the commit.
    """
    # Use db.get for an optimized primary key lookup
    db_vehicle_to_update = await db.get(Vehicle, vehicle_id)
    if not db_vehicle_to_update:
        return None  # Route handler will raise 404

    update_data = vehicle_data.model_dump(exclude_unset=True)

    # Handle VIN uniqueness check before attempting to set the attribute
    if 'vin' in update_data and update_data['vin'] and update_data['vin'] != db_vehicle_to_update.vin:
        existing_vin_vehicle = await db.execute(
            select(Vehicle.id).where(Vehicle.vin == update_data['vin'], Vehicle.id != vehicle_id)
        )
        if existing_vin_vehicle.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"VIN '{update_data['vin']}' already exists for another vehicle."
            )

    for key, value in update_data.items():
        setattr(db_vehicle_to_update, key, value)
    
    # Flush and refresh to ensure the session object reflects the staged changes
    await db.flush()
    await db.refresh(db_vehicle_to_update)
    
    return db_vehicle_to_update


async def delete_vehicle(db: AsyncSession, vehicle_id: int) -> None:
    """
    Deletes a vehicle instance from the session but does NOT commit.
    The caller (route handler) is responsible for the commit.
    """
    db_vehicle = await db.get(Vehicle, vehicle_id)
    
    if not db_vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICLE_NOT_FOUND)

    await db.delete(db_vehicle)
    await db.flush() # Flush to ensure the deletion is registered in the session state.