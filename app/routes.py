import json
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.crud.backup import analyze_backup_file, execute_import, get_configured_backup_data
from app.crud.vehicle_interval_override import create_or_update_vehicle_interval_override, delete_vehicle_interval_override, get_all_overrides_for_vehicle, get_vehicle_interval_override
from app.schemas import (
    BackupAnalysisResponse, BackupConfiguration, FullBackupData, MaintenanceLogUpdate, RestorePlan, ServiceTypeLogSummary, ServiceTypeUpdate, VehicleCreate, VehicleRead,
    MaintenanceLogCreate, MaintenanceLogRead,
    MaintenanceSummary, ServiceTypeCreate, ServiceTypeRead,
    CustomFieldCreate, CustomFieldRead, CustomFieldValueCreate, CustomFieldValueRead, VehicleServiceIntervalOverrideCreate, VehicleServiceIntervalOverrideRead, VehicleServiceIntervalOverrideUpdate, VehicleUpdate
)
from app.crud import (
    create_vehicle, delete_service_type_by_id, get_maintenance_log, get_maintenance_summary_by_service_type, get_service_type_by_id, get_vehicle, get_vehicles, update_maintenance_log, update_service_type_by_id, update_vehicle, delete_vehicle,
    create_maintenance_log, get_filtered_maintenance_logs, get_logs_for_vehicle, get_maintenance_summary,
    create_service_type, get_service_types,
    create_custom_field, get_custom_fields_for_service_type,delete_maintenance_log,
    get_field_values_for_log
)
from app.database import get_db


OVERRIDE_NOT_FOUND = "Vehicle-specific interval override not found"
VEHICLE_NOT_FOUND = "Vehicle not found" 
SERVICE_TYPE_NOT_FOUND = "Service type not found"

MAINTENANCE_LOG_TAGS = ["Maintenance Logs"]
INTERVAL_OVERRIDE_TAGS = ["Vehicle Interval Overrides"]
BACKUP_TAGS = ["Backup & Restore"]


router = APIRouter()

@router.post("/vehicles/", response_model=VehicleRead)
async def add_vehicle(vehicle: VehicleCreate, db: AsyncSession = Depends(get_db)):
    return await create_vehicle(db, vehicle_data=vehicle)


@router.put("/vehicles/{vehicle_id}", response_model=VehicleRead)
async def update_vehicle_route(vehicle_id: int, vehicle_data: VehicleUpdate, db: AsyncSession = Depends(get_db)):
    updated_vehicle = await update_vehicle(db, vehicle_id, vehicle_data)
    if not updated_vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICLE_NOT_FOUND)
    return updated_vehicle

@router.get("/vehicles/{vehicle_id}", response_model=VehicleRead)
async def read_vehicle(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    db_vehicle = await get_vehicle(db, vehicle_id)
    if not db_vehicle:
        raise HTTPException(status_code=404, detail=VEHICLE_NOT_FOUND)
    return db_vehicle

@router.delete("/vehicles/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vehicle_route(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    await delete_vehicle(db, vehicle_id)

@router.post("/vehicles/{vehicle_id}/logs/", response_model=MaintenanceLogRead)
async def add_maintenance_log(vehicle_id: int, log: MaintenanceLogCreate, db: AsyncSession = Depends(get_db)):
    return await create_maintenance_log(db, log, vehicle_id)

@router.get("/vehicles/", response_model=List[VehicleRead])
async def list_vehicles(db: AsyncSession = Depends(get_db)):
    return await get_vehicles(db)


@router.get("/vehicles/{vehicle_id}/logs/summary", response_model=MaintenanceSummary)
async def maintenance_summary(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    summary_data = await get_maintenance_summary(db, vehicle_id)
    return summary_data

@router.get(
    "/vehicles/{vehicle_id}/maintenance_summary_by_type",
    response_model=List[ServiceTypeLogSummary],
    summary="Get Maintenance Summary by Service Type for a Vehicle",
    tags=["Vehicles", "Maintenance Logs"] # Add appropriate tags
)
async def read_maintenance_summary_by_type(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves a summary of maintenance logs for a specific vehicle,
    grouped by service type. Each summary includes the count of logs,
    the date of the last service, and the mileage at the last service for that type.
    """
    summary = await get_maintenance_summary_by_service_type(db=db, vehicle_id=vehicle_id)
    
    return summary

@router.get("/maintenance_logs/", response_model=List[MaintenanceLogRead])
async def list_maintenance_logs(
    vehicle_id: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    min_mileage: Optional[int] = Query(None),
    max_mileage: Optional[int] = Query(None),
    service_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await get_filtered_maintenance_logs(
        db=db,
        vehicle_id=vehicle_id,
        start_date=start_date,
        end_date=end_date,
        min_mileage=min_mileage,
        max_mileage=max_mileage,
        service_type=service_type,
    )
    

@router.get(
    "/maintenance_logs/{log_id}",
    response_model=MaintenanceLogRead,
    summary="Get a Specific Maintenance Log",
    tags=MAINTENANCE_LOG_TAGS
)
async def read_maintenance_log(
    log_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve a single maintenance log by its ID, including all its details
    like service type and custom field values.
    """
    db_log = await get_maintenance_log(db=db, log_id=log_id)
    # get_maintenance_log will raise 404 if not found
    return db_log

# @router.put("/test_log_update_schema/", summary="Test MaintenanceLogUpdate schema")
# async def test_schema_route(data: MaintenanceLogUpdate):
#     print(f"--- TEST ROUTE ---")
#     print(f"Received data: {data.model_dump_json(indent=2)}")
#     print(f"Date field type: {type(data.date)}")
#     print(f"Date field value: {data.date}")
#     return {"status": "received", "parsed_date": data.date, "date_type_str": str(type(data.date))}


@router.put("/maintenance_logs/{log_id}", response_model=MaintenanceLogRead, summary="Update a Maintenance Log", tags=MAINTENANCE_LOG_TAGS )
async def update_existing_maintenance_log(
    log_id: int,
    log_update_data: MaintenanceLogUpdate, # Use the update schema for the request body
    db: AsyncSession = Depends(get_db)
):
    """
    Update an existing maintenance log.
    Allows updating date, mileage, service type, cost, notes, and custom field values.
    When custom_field_values are provided, they replace all existing custom values for the log.
    """
    updated_log = await update_maintenance_log(db=db, log_id=log_id, log_data=log_update_data)
    # update_maintenance_log will raise 404 if log not found,
    # or 400/409 for other validation issues.
    return updated_log

@router.delete(
    "/maintenance_logs/{log_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a Maintenance Log",
    tags=MAINTENANCE_LOG_TAGS
)
async def remove_maintenance_log(
    log_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a specific maintenance log by its ID.
    This will also remove associated custom field values.
    """
    await delete_maintenance_log(db=db, log_id=log_id) # CRUD handles 404
    # No content returned for 204

@router.get("/vehicles/{vehicle_id}/logs", response_model=List[MaintenanceLogRead])
async def get_logs_by_vehicle(vehicle_id: int,service_type_id: Optional[int] = Query(None, description="Filter logs by a specific service type ID"), db: AsyncSession = Depends(get_db)):
    logs = await get_logs_for_vehicle(db, vehicle_id, service_type_id)
    return logs

@router.post("/service_types/{service_type_id}/custom_fields/", response_model=CustomFieldRead)
async def add_custom_field(service_type_id: int, field: CustomFieldCreate, db: AsyncSession = Depends(get_db)):
    return await create_custom_field(db, field, service_type_id)

@router.get("/service_types/{service_type_id}/custom_fields/", response_model=List[CustomFieldRead])
async def list_custom_fields(service_type_id: int, db: AsyncSession = Depends(get_db)):
    return await get_custom_fields_for_service_type(db, service_type_id)

@router.get("/service_types/{service_type_id}", response_model=ServiceTypeRead)
async def get_service_type(service_type_id: int, db: AsyncSession = Depends(get_db)):
    return await get_service_type_by_id(db, service_type_id)

@router.post("/service_types/", response_model=ServiceTypeRead)
async def add_service_type(service_type: ServiceTypeCreate, db: AsyncSession = Depends(get_db)):
    return await create_service_type(db, service_type)

@router.get("/service_types/", response_model=List[ServiceTypeRead])
async def list_service_types(db: AsyncSession = Depends(get_db)):
    return await get_service_types(db)

@router.put("/service_types/{service_type_id}", response_model=ServiceTypeRead)
async def update_service_type(service_type_id: int, updated_data: ServiceTypeUpdate, db: AsyncSession = Depends(get_db)):
    return await update_service_type_by_id(db, service_type_id, updated_data)

@router.delete("/service_types/{service_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service_type(service_type_id: int, db: AsyncSession = Depends(get_db)):
    await delete_service_type_by_id(db, service_type_id)
    
@router.post(
    "/vehicles/{vehicle_id}/interval_overrides/{service_type_id}",
    response_model=VehicleServiceIntervalOverrideRead,
    summary="Create or Update a Vehicle-Specific Service Interval Override",
    status_code=status.HTTP_201_CREATED, # Use 201 for new, 200 if it was an update
    tags=INTERVAL_OVERRIDE_TAGS
)
async def set_vehicle_interval_override(
    vehicle_id: int,
    service_type_id: int,
    override_data: VehicleServiceIntervalOverrideCreate, # Pydantic model for the request body
    db: AsyncSession = Depends(get_db)
):
    """
    Sets or updates a specific service interval override for a given vehicle and service type.
    - If an override already exists, it's updated with the provided values.
    - If no override exists, a new one is created.
    - To clear an override for a specific metric (km or days), send `null` for that field.
      If both `override_interval_km` and `override_interval_days` are set to `null`,
      the override record will still exist signifying an explicit "no override specified here".
      To completely remove the override and revert to defaults, use the DELETE endpoint.
    """
    
    db_override = await create_or_update_vehicle_interval_override(
        db=db,
        vehicle_id=vehicle_id,
        service_type_id=service_type_id,
        override_data=override_data
    )
    # If you want to differentiate status codes:
    # If it was an update, you might return status.HTTP_200_OK.
    # This requires the CRUD to signal if it created or updated.
    # For now, assuming upsert returns the final state with 201/200.
    # Let's stick to 200 if it could be an update, or refine CRUD to signal.
    # For an upsert, HTTP 200 is often fine if resource state is simply replaced/updated.
    # If you strictly follow POST for create, PUT for update/replace:
    # You would have two separate endpoints. create_or_update is a common convenience.
    # Let's assume we will use PUT for upsert, making it idempotent.
    return db_override


@router.get(
    "/vehicles/{vehicle_id}/interval_overrides/{service_type_id}",
    response_model=VehicleServiceIntervalOverrideRead,
    summary="Get a Specific Vehicle Interval Override",
    tags=INTERVAL_OVERRIDE_TAGS
)
async def read_vehicle_interval_override(
    vehicle_id: int,
    service_type_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves a specific service interval override for a vehicle and service type, if it exists.
    """
    db_override = await get_vehicle_interval_override(db, vehicle_id, service_type_id)
    if db_override is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=OVERRIDE_NOT_FOUND)
    return db_override


@router.get(
    "/vehicles/{vehicle_id}/interval_overrides/",
    response_model=List[VehicleServiceIntervalOverrideRead],
    summary="List All Interval Overrides for a Vehicle",
    tags=INTERVAL_OVERRIDE_TAGS
)
async def list_vehicle_interval_overrides(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves all vehicle-specific service interval overrides defined for a given vehicle.
    """
    # CRUD function get_all_overrides_for_vehicle already handles vehicle not found
    overrides = await get_all_overrides_for_vehicle(db, vehicle_id=vehicle_id)
    return overrides


@router.delete(
    "/vehicles/{vehicle_id}/interval_overrides/{service_type_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a Vehicle Interval Override",
    tags=INTERVAL_OVERRIDE_TAGS
)
async def remove_vehicle_interval_override(
    vehicle_id: int,
    service_type_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Deletes a specific service interval override for a vehicle and service type.
    This means the vehicle will revert to using the default service type interval (if any).
    """
    # The CRUD function delete_vehicle_interval_override handles 404 if override not found
    await delete_vehicle_interval_override(db, vehicle_id, service_type_id)
    return # FastAPI handles 204 No Content response automatically


# --- Adjusting the upsert endpoint to use PUT for better idempotency semantics ---

@router.put( # Changed from POST to PUT
    "/vehicles/{vehicle_id}/interval_overrides/{service_type_id}",
    response_model=VehicleServiceIntervalOverrideRead,
    summary="Create or Update (Upsert) a Vehicle-Specific Service Interval Override",
    status_code=status.HTTP_200_OK, # 200 OK for update/replace, can be 201 if created (requires more logic)
    tags=INTERVAL_OVERRIDE_TAGS,
    # Overwrites the POST if you keep both, or remove the POST version
    # For simplicity, let's assume this PUT replaces the POST for upsert
)
async def upsert_vehicle_interval_override( # Renamed function for clarity
    vehicle_id: int,
    service_type_id: int,
    override_data: VehicleServiceIntervalOverrideUpdate, # Use Update schema for flexibility
                                                        # (assuming Create and Update have same relevant fields)
    db: AsyncSession = Depends(get_db),
    # To provide different status codes for create vs update:
    # response: Response # Import Response from fastapi
):
    """
    Sets (creates or updates) a specific service interval override for a vehicle and service type.
    This operation is idempotent.
    - To clear an override for a specific metric (km or days), send `null` for that field.
    - To completely remove the override and revert to defaults, use the DELETE endpoint.
    """
    # The CRUD function handles 404 for vehicle/service_type not found
    # and also handles the create vs update logic.
    # To return 201 on create and 200 on update, the CRUD would need to signal this.
    # For now, returning 200 for a successful upsert is acceptable.
    
    # Check if it exists to determine status code (optional complexity)
    # existing_override = await get_vehicle_interval_override(db, vehicle_id, service_type_id)
    
    db_override = await create_or_update_vehicle_interval_override(
        db=db,
        vehicle_id=vehicle_id,
        service_type_id=service_type_id,
        override_data=override_data # Pass VehicleServiceIntervalOverrideUpdate
    )
    
    # if not existing_override:
    #     response.status_code = status.HTTP_201_CREATED
    # else:
    #     response.status_code = status.HTTP_200_OK
        
    return db_override


@router.post(
    "/backup/export", 
    response_model=FullBackupData, 
    summary="Export a Configurable Backup",
    tags=BACKUP_TAGS
)
async def export_configurable_backup(
    config: BackupConfiguration, # The configuration is the request body
    db: AsyncSession = Depends(get_db)
):
    """
    Generates and returns a backup of application data in JSON format based on
    the provided configuration options. The frontend client is responsible for
    triggering the download of the returned JSON data.
    """
    backup_data = await get_configured_backup_data(db, config)
    return backup_data


@router.post(
    "/backup/analyze",
    response_model=BackupAnalysisResponse,
    summary="Analyze a backup file for import",
    tags=BACKUP_TAGS
)
async def analyze_backup(
    backup_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Receives a JSON backup file, parses it, and compares its content
    with the current database to identify new and conflicting vehicles.
    """
    try:
        contents = await backup_file.read()
        data = json.loads(contents)
        backup_data = FullBackupData.model_validate(data)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid or corrupted backup file: {e}")

    analysis_result = await analyze_backup_file(db, backup_data)
    return analysis_result

# This is a complex payload, so we create a Pydantic model to receive it
class ImportExecutionPayload(BaseModel):
    plan: RestorePlan
    backup_data: FullBackupData # The frontend sends the original backup data again

@router.post(
    "/backup/execute_import",
    summary="Execute a restore from backup based on a user-defined plan",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=BACKUP_TAGS
)
async def execute_restore_from_backup(
    payload: ImportExecutionPayload,
    db: AsyncSession = Depends(get_db)
):
    """
    DANGEROUS OPERATION: Replaces and/or adds data from a backup file
    according to a specific user-confirmed plan. This is executed inside a
    single database transaction.
    """
    try:
        # The execute_import function will perform all DB operations.
        # It's wrapped here in a transaction context to ensure atomicity.
        await execute_import(db, payload.backup_data, payload.plan)
        await db.commit()
    except IntegrityError as e: # Catch potential unique constraint violations, etc.
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Database integrity error during import: {e.orig}")
    except Exception as e:
        await db.rollback()
        # Log the full error for debugging
        print(f"ERROR during import execution: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An unexpected error occurred during the import process.")
    
    # Return 204 No Content on success
    return