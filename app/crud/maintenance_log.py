from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload, selectinload, aliased
from sqlalchemy import and_, func, delete, desc
from typing import List, Optional
from datetime import date

from app.models.base import Vehicle, MaintenanceLog, ServiceType, CustomField, CustomFieldValue
from app.schemas import ServiceTypeLogSummary, MaintenanceLogCreate, MaintenanceLogUpdate, CustomFieldValueCreate
from fastapi import HTTPException, status

VEHICLE_NOT_FOUND = "Vehicle not found"
SERVICE_TYPE_NOT_FOUND = "Service type not found"
LOG_NOT_FOUND = "Maintenance log not found"

# --- Data Modification Functions (No Commits) ---

async def create_maintenance_log(db: AsyncSession, log_data: MaintenanceLogCreate, vehicle_id: int) -> MaintenanceLog:
    """
    Creates a new maintenance log and its values in the session, but does NOT commit.
    """
    # 1. Preliminary validation
    if not await db.get(Vehicle, vehicle_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICLE_NOT_FOUND)
    if log_data.service_type_id and not await db.get(ServiceType, log_data.service_type_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=SERVICE_TYPE_NOT_FOUND)

    # 2. Separate log data from custom field values
    custom_values_data = log_data.custom_field_values or []
    main_log_data = log_data.model_dump(exclude={"custom_field_values"})

    # 3. Validate custom field IDs belong to the service type
    if custom_values_data and log_data.service_type_id:
        incoming_field_ids = [fv.field_id for fv in custom_values_data]
        await validate_field_ids_belong_to_service_type(db, incoming_field_ids, log_data.service_type_id)

    # 4. Create and stage the main log object
    db_log = MaintenanceLog(**main_log_data, vehicle_id=vehicle_id)
    db.add(db_log)
    await db.flush()  # Flush to get the db_log.id

    # 5. Stage custom field values
    if custom_values_data:
        await set_custom_field_values(db, db_log.id, custom_values_data)

    await db.flush() # Flush all staged changes (log and values)
    await db.refresh(db_log) # Refresh the log object
    return db_log

async def update_maintenance_log(db: AsyncSession, log_id: int, log_data: MaintenanceLogUpdate) -> None:
    """
    Updates a maintenance log and its values in the session, but does NOT commit.
    """
    db_log = await db.get(MaintenanceLog, log_id)
    if not db_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=LOG_NOT_FOUND)

    update_payload_dict = log_data.model_dump(by_alias=True, exclude_unset=True)
    current_service_type_id = db_log.service_type_id

    # 1. Validate new service_type_id if it's being changed
    if "service_type_id" in update_payload_dict and update_payload_dict["service_type_id"] is not None:
        new_id = update_payload_dict["service_type_id"]
        if not await db.get(ServiceType, new_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"ServiceType with id {new_id} not found")
        current_service_type_id = new_id

    # 2. Apply scalar updates (date, mileage, cost, etc.)
    for key, value in update_payload_dict.items():
        if key != "custom_field_values": # We handle this separately
            setattr(db_log, key, value)

    # 3. Handle custom field values (full replacement)
    if "custom_field_values" in log_data.model_fields_set:
        custom_values_data = log_data.custom_field_values or []
        if custom_values_data and current_service_type_id:
            incoming_field_ids = [fv.field_id for fv in custom_values_data]
            await validate_field_ids_belong_to_service_type(db, incoming_field_ids, current_service_type_id)
        
        await set_custom_field_values(db, log_id, custom_values_data)

    await db.flush() # Flush all staged changes before returning

async def delete_maintenance_log(db: AsyncSession, log_id: int) -> None:
    """Stages a maintenance log for deletion, but does NOT commit."""
    db_log = await db.get(MaintenanceLog, log_id)
    if not db_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=LOG_NOT_FOUND)

    await db.delete(db_log)
    await db.flush() # Ensure the deletion is registered in the session

async def set_custom_field_values(db: AsyncSession, log_id: int, field_values_data: List[CustomFieldValueCreate]) -> None:
    """
    Helper to replace custom field values for a log. Does NOT commit.
    """
    # 1. Clear existing values for this log
    await db.execute(delete(CustomFieldValue).where(CustomFieldValue.log_id == log_id))

    # 2. Add new values
    if field_values_data:
        values_to_add = [CustomFieldValue(log_id=log_id, **val.model_dump()) for val in field_values_data]
        db.add_all(values_to_add)
    
    # No flush needed here; the calling function will flush.

async def validate_field_ids_belong_to_service_type(db: AsyncSession, field_ids: List[int], service_type_id: int):
    """Ensures all provided custom field IDs belong to the specified service type."""
    if not field_ids: # No IDs to validate
        return

    result = await db.execute(
        select(CustomField.id).where(
            CustomField.service_type_id == service_type_id,
            CustomField.id.in_(field_ids) # Use .in_ for efficiency
        )
    )
    valid_ids_for_service_type = {row[0] for row in result.all()}
    provided_ids = set(field_ids)

    invalid_ids = provided_ids - valid_ids_for_service_type

    if invalid_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, # Use 400 for bad client input
            detail=f"Custom fields with IDs {list(invalid_ids)} do not belong to ServiceType {service_type_id}"
        )

async def get_logs_for_vehicle(db: AsyncSession, vehicle_id: int, service_type_id: Optional[int] = None) -> List[MaintenanceLog]:
    """Gets all maintenance logs for a specific vehicle, optionally filtered by service_type_id."""
    # Ensure vehicle exists
    vehicle_check = await db.get(Vehicle, vehicle_id)
    if not vehicle_check:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICLE_NOT_FOUND)

    stmt = select(MaintenanceLog).where(MaintenanceLog.vehicle_id == vehicle_id)

    if service_type_id is not None:
        stmt = stmt.where(MaintenanceLog.service_type_id == service_type_id)
        # Optional: Check if service_type_id is valid for this vehicle,
        # or just return empty if no logs match (current behavior).
        # service_type_check = await db.get(ServiceType, service_type_id)
        # if not service_type_check:
        #     # Or raise a specific error if service_type_id itself is invalid
        #     return [] 

    stmt = stmt.options(
        joinedload(MaintenanceLog.service_type).joinedload(ServiceType.fields),
        joinedload(MaintenanceLog.custom_field_values).joinedload(CustomFieldValue.custom_field)
    ).order_by(MaintenanceLog.date.desc(), MaintenanceLog.id.desc())
    
    result = await db.execute(stmt)
    
    return result.unique().scalars().all()

async def get_filtered_maintenance_logs(
    db: AsyncSession,
    vehicle_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    min_mileage: Optional[int] = None,
    max_mileage: Optional[int] = None,
    service_type: Optional[str] = None,
) -> List[MaintenanceLog]:

    filters = []

    if vehicle_id is not None:
        filters.append(MaintenanceLog.vehicle_id == vehicle_id)
    if start_date is not None:
        filters.append(MaintenanceLog.date >= start_date)
    if end_date is not None:
        filters.append(MaintenanceLog.date <= end_date)
    if min_mileage is not None:
        filters.append(MaintenanceLog.mileage >= min_mileage)
    if max_mileage is not None:
        filters.append(MaintenanceLog.mileage <= max_mileage)
    if service_type is not None:
        filters.append(ServiceType.name == service_type)

    stmt = (
        select(MaintenanceLog)
        .join(ServiceType, MaintenanceLog.service_type)
        .options(
            joinedload(MaintenanceLog.custom_field_values).joinedload(CustomFieldValue.custom_field),
            joinedload(MaintenanceLog.service_type),
        )
    )

    if filters:
        stmt = stmt.where(and_(*filters))

    result = await db.execute(stmt)
    return result.scalars().all()

async def get_maintenance_summary_by_service_type(db: AsyncSession, vehicle_id: int) -> List[ServiceTypeLogSummary]:
    """
    Generates a summary of maintenance logs for a given vehicle, grouped by service type.
    For each service type, it provides the count of logs, total cost, the date of the last log,
    and the mileage at the last log.
    """
    # Step 1: Ensure vehicle exists (this is correct)
    vehicle = await db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICLE_NOT_FOUND)

    # Step 2: Subquery to rank logs to find the latest one for each service type.
    # This part was correct and is the best way to solve the "group-wise maximum" problem.
    log_alias = aliased(MaintenanceLog, name="log_ranked")
    ranked_logs_subquery = (
        select(
            log_alias.id,
            log_alias.service_type_id,
            log_alias.date,
            log_alias.mileage,
            func.row_number().over(
                partition_by=log_alias.service_type_id,
                order_by=[desc(log_alias.date), desc(log_alias.id)],
            ).label("rnk"),
        )
        .where(log_alias.vehicle_id == vehicle_id)
        .where(log_alias.service_type_id.is_not(None))
        .subquery("latest_log_details")
    )

    # Step 3: Main query to perform the aggregation. This is the corrected part.
    stmt = (
        select(
            ServiceType.id.label("service_type_id"),
            ServiceType.name.label("service_type_name"),
            func.count(MaintenanceLog.id).label("log_count"),
            func.coalesce(func.sum(MaintenanceLog.cost), 0.0).label("total_cost_for_service_type"),
            # Use MAX() on the subquery columns. Since we filter to rnk=1, it will pick the single latest value.
            func.max(ranked_logs_subquery.c.date).label("last_log_date"),
            func.max(ranked_logs_subquery.c.mileage).label("last_log_mileage"),
        )
        # Start from ServiceType and LEFT JOIN to logs to include all relevant types for the vehicle.
        .join(MaintenanceLog, ServiceType.id == MaintenanceLog.service_type_id)
        # LEFT JOIN to the subquery to get details of only the latest log.
        .join(
            ranked_logs_subquery,
            and_(
                MaintenanceLog.id == ranked_logs_subquery.c.id,
                ranked_logs_subquery.c.rnk == 1,
            ),
            isouter=True # Use LEFT JOIN (isouter=True)
        )
        .where(MaintenanceLog.vehicle_id == vehicle_id)
        # The main GROUP BY should only contain the columns that define the group.
        .group_by(ServiceType.id, ServiceType.name)
        .order_by(ServiceType.name)
    )
    
    result = await db.execute(stmt)
    
    # model_validate on the mapping result is the correct and modern Pydantic way.
    summaries = [ServiceTypeLogSummary.model_validate(row) for row in result.mappings().all()]
    
    return summaries

async def get_field_values_for_log(db: AsyncSession, log_id: int) -> List[CustomFieldValue]:
    """Gets all custom field values for a specific log, including the field definition."""
    # Optional: Check if log exists
    log_exists = await db.get(MaintenanceLog, log_id)
    if not log_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=LOG_NOT_FOUND)

    result = await db.execute(
        select(CustomFieldValue)
        .options(selectinload(CustomFieldValue.custom_field)) # Use selectinload here
        .where(CustomFieldValue.log_id == log_id) # Correct attribute name
        .order_by(CustomFieldValue.id) # Add ordering
    )
    return result.scalars().all()

async def get_maintenance_summary(db: AsyncSession, vehicle_id: int) -> dict:
    """Calculates a summary of maintenance logs for a vehicle."""
    # Ensure vehicle exists first
    vehicle_check = await db.get(Vehicle, vehicle_id)
    if not vehicle_check:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICLE_NOT_FOUND)

    # Aggregate query
    result = await db.execute(
        select(
            func.count(MaintenanceLog.id),
            func.coalesce(func.sum(MaintenanceLog.cost), 0.0), # Ensure float default
            func.max(MaintenanceLog.date), # Get max date directly
            func.max(MaintenanceLog.mileage) # Assuming max mileage corresponds to latest, might need adjustment
        )
        .where(MaintenanceLog.vehicle_id == vehicle_id)
    )
    # Use .one() as we expect one row even if no logs (count=0)
    total_logs, total_cost, last_service_date, last_mileage = result.one()

    # Refined logic for last mileage (get mileage from latest date log)
    if last_service_date:
        mileage_res = await db.execute(
            select(MaintenanceLog.mileage)
            .where(MaintenanceLog.vehicle_id == vehicle_id, MaintenanceLog.date == last_service_date)
            .order_by(MaintenanceLog.id.desc()) # Tie-breaker if multiple logs on same date
            .limit(1)
        )
        last_mileage = mileage_res.scalar_one_or_none()

    average_cost = total_cost / total_logs if total_logs > 0 else 0.0
    days_since_last_service = (
        (date.today() - last_service_date).days if last_service_date else None
    )

    # Return dict matching MaintenanceSummary schema structure
    return {
        "vehicle_id": vehicle_id,
        "total_logs": total_logs,
        "total_cost": total_cost, # Already float
        "average_cost": round(average_cost, 2),
        "last_service_date": last_service_date,
        "days_since_last_service": days_since_last_service,
        "last_mileage": last_mileage,
    }

async def get_maintenance_log(db: AsyncSession, log_id: int) -> MaintenanceLog: 
    """
    Fetches a single maintenance log by ID with all required relationships
    loaded for the MaintenanceLogRead schema. Raises 404 if not found.
    """
    result = await db.execute(
        select(MaintenanceLog)
        .options(
            joinedload(MaintenanceLog.service_type)
                .joinedload(ServiceType.fields),
            joinedload(MaintenanceLog.custom_field_values)
                .joinedload(CustomFieldValue.custom_field)
        )
        .where(MaintenanceLog.id == log_id)
    )
    db_log = result.unique().scalar_one_or_none()
    if not db_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=LOG_NOT_FOUND)
    return db_log 
