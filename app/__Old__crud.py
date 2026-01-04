# from sqlalchemy.ext.asyncio import AsyncSession
# from sqlalchemy.future import select
# from sqlalchemy.orm import joinedload, selectinload, aliased  
# from sqlalchemy import and_, func, delete, desc  
# from typing import List, Optional
# from datetime import date, timedelta # Import timedelta if needed for summary calculations

# from app.models.base import Vehicle, MaintenanceLog, ServiceType, CustomField, CustomFieldValue
# # Adjusted schema imports slightly for potential better naming
# from app.schemas import (
#     ServiceTypeLogSummary, VehicleCreate, VehicleUpdate, VehicleRead,
#     MaintenanceLogCreate, MaintenanceLogUpdate, MaintenanceLogRead, MaintenanceSummary,
#     ServiceTypeCreate, ServiceTypeUpdate, ServiceTypeRead,
#     CustomFieldCreate, CustomFieldRead, # Assuming these exist if needed
#     CustomFieldValueCreate, CustomFieldValueRead # Assuming these exist if needed
# )
# from fastapi import HTTPException, status

# # Consistent error messages
# VEHICLE_NOT_FOUND = "Vehicle not found"
# SERVICE_TYPE_NOT_FOUND = "Service type not found"
# LOG_NOT_FOUND = "Maintenance log not found"

# # ─────────────────────────────────────────────
# # VEHICLE CRUD
# # ─────────────────────────────────────────────

# async def create_vehicle(db: AsyncSession, vehicle_data: VehicleCreate) -> Vehicle:
#     """Creates a new vehicle."""
#     if vehicle_data.vin: # Check the incoming data
#         result = await db.execute(
#             select(Vehicle.id).where(Vehicle.vin == vehicle_data.vin)
#         )
#         if result.scalar_one_or_none():
#             raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"A vehicle with VIN '{vehicle_data.vin}' already exists.")

#     db_vehicle = Vehicle(**vehicle_data.model_dump())
#     db.add(db_vehicle)
#     await db.commit()

#     fetched_vehicle = await get_vehicle(db=db, vehicle_id=db_vehicle.id)
#     if not fetched_vehicle:
#         # This should ideally not happen if commit succeeded, but handle defensively
#         raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve newly created vehicle.")
#     return fetched_vehicle
#     # If full graph is *always* needed on create, re-fetch using get_vehicle:
#     # return await get_vehicle(db, db_vehicle.id) # This ensures full graph as per get_vehicle definition

# async def get_vehicle(db: AsyncSession, vehicle_id: int) -> Optional[Vehicle]:
#     """Gets a single vehicle by ID, ensuring all nested data needed for serialization is loaded."""
#     result = await db.execute(
#         select(Vehicle)
#         .options(
#             # Use joinedload similar to get_vehicles
#             joinedload(Vehicle.maintenance_logs)
#                 .joinedload(MaintenanceLog.service_type)
#                 .joinedload(ServiceType.fields), # JOIN fields needed by ServiceTypeRead

#             joinedload(Vehicle.maintenance_logs)
#                 .joinedload(MaintenanceLog.custom_field_values)
#                 .joinedload(CustomFieldValue.custom_field) # JOIN field needed by CustomFieldValueRead
#         )
#         .where(Vehicle.id == vehicle_id)
#     )
#     # unique() is needed here too if logs are loaded via join
#     return result.unique().scalar_one_or_none()

# async def get_vehicles(db: AsyncSession) -> List[Vehicle]:
#     """Gets all vehicles, ensuring all nested data needed for serialization is loaded."""
#     result = await db.execute(
#         select(Vehicle)
#         .options(
#             # Use joinedload for the paths required by VehicleRead -> MaintLogRead -> ServiceTypeRead/CustomFieldValueRead
#             joinedload(Vehicle.maintenance_logs)
#                 .joinedload(MaintenanceLog.service_type)
#                 # .selectinload(ServiceType.fields), # PROBLEM: This might load too late or cause MissingGreenlet if ServiceTypeRead needs it. Let's ensure it's joined.
#                 .joinedload(ServiceType.fields), # JOIN fields needed by ServiceTypeRead

#             joinedload(Vehicle.maintenance_logs) # Redundant path definition ok, SQLAlchemy optimizes
#                 .joinedload(MaintenanceLog.custom_field_values)
#                 # .selectinload(CustomFieldValue.custom_field) # PROBLEM: Might load too late for CustomFieldValueRead. Let's join it.
#                 .joinedload(CustomFieldValue.custom_field) # JOIN field needed by CustomFieldValueRead
#         )
#         .order_by(Vehicle.make, Vehicle.model)
#     )
#     # unique() is needed with joinedload across collections to deduplicate parent objects
#     return result.unique().scalars().all()

# async def update_vehicle(db: AsyncSession, vehicle_id: int, vehicle_data: VehicleUpdate) -> Optional[Vehicle]:
#     """Updates an existing vehicle."""
#     db_vehicle_to_update = await db.get(Vehicle, vehicle_id) # Fetch the instance to update
#     if not db_vehicle_to_update:
#         # If not found, the route handler will raise a 404
#         # Alternatively, raise HTTPException here:
#         # raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
#         return None 

#     update_data = vehicle_data.model_dump(exclude_unset=True)

#     # Handle VIN uniqueness explicitly before attempting to set attribute
#     if 'vin' in update_data and update_data['vin'] and update_data['vin'] != db_vehicle_to_update.vin:
#         existing_vin_vehicle = await db.execute(
#             select(Vehicle.id).where(Vehicle.vin == update_data['vin'], Vehicle.id != vehicle_id)
#         )
#         if existing_vin_vehicle.scalar_one_or_none():
#             raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"VIN '{update_data['vin']}' already exists for another vehicle.")

#     for key, value in update_data.items():
#         setattr(db_vehicle_to_update, key, value)
    
#     try:
#         await db.commit()
#     except IntegrityError as e: # Catch potential DB-level unique constraint violations (e.g., VIN)
#         await db.rollback()
#         # Check if it's a VIN unique constraint error (specific to PostgreSQL, adapt if needed)
#         if "vehicles_vin_key" in str(e.orig): # Example check
#             raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"VIN '{update_data.get('vin')}' already exists.")
#         raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database error during update.") from e


#     # After successful commit, re-fetch the vehicle with all relationships
#     # needed by the VehicleRead response model. db_vehicle_to_update.id is valid.
#     fully_loaded_vehicle = await get_vehicle(db=db, vehicle_id=db_vehicle_to_update.id)
    
#     return fully_loaded_vehicle

# async def delete_vehicle(db: AsyncSession, vehicle_id: int) -> bool:
#     """Deletes a vehicle by ID."""
#     db_vehicle = await db.get(Vehicle, vehicle_id)
    
#     if not db_vehicle:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")

#     await db.delete(db_vehicle) 
#     await db.commit()
#     return True


# # ─────────────────────────────────────────────
# # MAINTENANCE LOG CRUD
# # ─────────────────────────────────────────────

# async def get_maintenance_summary(db: AsyncSession, vehicle_id: int) -> dict:
#     """Calculates a summary of maintenance logs for a vehicle."""
#     # Ensure vehicle exists first
#     vehicle_check = await db.get(Vehicle, vehicle_id)
#     if not vehicle_check:
#        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICLE_NOT_FOUND)

#     # Aggregate query
#     result = await db.execute(
#         select(
#             func.count(MaintenanceLog.id),
#             func.coalesce(func.sum(MaintenanceLog.cost), 0.0), # Ensure float default
#             func.max(MaintenanceLog.date), # Get max date directly
#             func.max(MaintenanceLog.mileage) # Assuming max mileage corresponds to latest, might need adjustment
#         )
#         .where(MaintenanceLog.vehicle_id == vehicle_id)
#     )
#     # Use .one() as we expect one row even if no logs (count=0)
#     total_logs, total_cost, last_service_date, last_mileage = result.one()

#     # Refined logic for last mileage (get mileage from latest date log)
#     if last_service_date:
#          mileage_res = await db.execute(
#             select(MaintenanceLog.mileage)
#             .where(MaintenanceLog.vehicle_id == vehicle_id, MaintenanceLog.date == last_service_date)
#             .order_by(MaintenanceLog.id.desc()) # Tie-breaker if multiple logs on same date
#             .limit(1)
#          )
#          last_mileage = mileage_res.scalar_one_or_none()

#     average_cost = total_cost / total_logs if total_logs > 0 else 0.0
#     days_since_last_service = (
#         (date.today() - last_service_date).days if last_service_date else None
#     )

#     # Return dict matching MaintenanceSummary schema structure
#     return {
#         "vehicle_id": vehicle_id,
#         "total_logs": total_logs,
#         "total_cost": total_cost, # Already float
#         "average_cost": round(average_cost, 2),
#         "last_service_date": last_service_date,
#         "days_since_last_service": days_since_last_service,
#         "last_mileage": last_mileage,
#     }

# async def _get_maintenance_log_detail(db: AsyncSession, log_id: int) -> Optional[MaintenanceLog]:
#     """Internal helper to fetch a maintenance log with required relationships for Read schema."""
#     result = await db.execute(
#         select(MaintenanceLog)
#         .options(
#             # Use selectinload for collections
#             joinedload(MaintenanceLog.service_type)  
#                 .joinedload(ServiceType.fields),  
#             joinedload(MaintenanceLog.custom_field_values)
#                 .joinedload(CustomFieldValue.custom_field)
#         )
#         .where(MaintenanceLog.id == log_id)
#     )
#     return result.unique().scalar_one_or_none()

# async def get_maintenance_log(db: AsyncSession, log_id: int) -> Optional[MaintenanceLog]:
#     """
#     Fetches a single maintenance log by ID with all required relationships
#     loaded for the MaintenanceLogRead schema.
#     """
#     result = await db.execute(
#         select(MaintenanceLog)
#         .options(
#             joinedload(MaintenanceLog.service_type)
#                 .joinedload(ServiceType.fields),
#             joinedload(MaintenanceLog.custom_field_values)
#                 .joinedload(CustomFieldValue.custom_field)
#         )
#         .where(MaintenanceLog.id == log_id)
#     )
#     db_log = result.unique().scalar_one_or_none()
#     if not db_log:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=LOG_NOT_FOUND)
#     return db_log

# async def update_maintenance_log(
#     db: AsyncSession, 
#     log_id: int, 
#     log_data: MaintenanceLogUpdate
# ) -> MaintenanceLog:
#     """
#     Updates an existing maintenance log.
#     Custom field values are replaced if provided.
#     """
#     # 1. Fetch the existing log
#     db_log = await db.get(MaintenanceLog, log_id) # Use db.get for direct model instance
#     if not db_log:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=LOG_NOT_FOUND)

#     # 2. Update scalar fields from the payload
#     update_data = log_data.model_dump(exclude_unset=True, exclude={"custom_field_values"}) # Exclude custom_field_values for now

#     if "service_type_id" in update_data and update_data["service_type_id"] is not None:
#         # Check if the new service_type_id is valid
#         service_type_check = await db.get(ServiceType, update_data["service_type_id"])
#         if not service_type_check:
#             raise HTTPException(
#                 status_code=status.HTTP_400_BAD_REQUEST, 
#                 detail=f"ServiceType with id {update_data['service_type_id']} not found"
#             )
#         # If service type changes, existing custom fields might become invalid.
#         # The set_custom_field_values will handle clearing old ones.
#         # We also need to ensure the new custom_field_values (if any) are valid for the *new* service_type_id.
    
#     current_service_type_id = update_data.get("service_type_id", db_log.service_type_id)


#     for key, value in update_data.items():
#         setattr(db_log, key, value)

#     # 3. Handle custom field values update (replace logic)
#     if log_data.custom_field_values is not None: # Check for explicit list (even empty) vs. None (no change)
#         # Validate new custom field IDs if provided
#         if log_data.custom_field_values:
#             incoming_field_ids = [fv.field_id for fv in log_data.custom_field_values]
#             if incoming_field_ids:
#                 await validate_field_ids_belong_to_service_type(db, incoming_field_ids, current_service_type_id)
        
#         # Use the existing function to delete old and insert new custom field values
#         await set_custom_field_values(db, log_id, log_data.custom_field_values)
#         # set_custom_field_values should handle its own commit or be part of this transaction

#     await db.commit()
#     # await db.refresh(db_log) # Refresh scalar attributes

#     # Re-fetch the full log with all relationships for the response, similar to create
#     updated_full_log = await get_maintenance_log(db, db_log.id) # Use the new public getter
#     if not updated_full_log: # Should not happen
#         raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve updated log.")
        
#     return updated_full_log

# async def create_maintenance_log(db: AsyncSession, log_data: MaintenanceLogCreate, vehicle_id: int) -> MaintenanceLog:
#     """Creates a new maintenance log and associated custom field values."""
#     # 1. Preliminary checks (already good)
#     vehicle_check = await db.get(Vehicle, vehicle_id)
#     if not vehicle_check:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICLE_NOT_FOUND)

#     service_type_check = await db.get(ServiceType, log_data.service_type_id)
#     if not service_type_check:
#         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=SERVICE_TYPE_NOT_FOUND)

#     # Separate custom field values from main log data
#     custom_values_data = log_data.custom_field_values or []
#     main_log_data = log_data.model_dump(exclude={"custom_field_values"})

#     # 2. Validate custom field IDs belong to the service type (already good)
#     if custom_values_data:
#         incoming_field_ids = [fv.field_id for fv in custom_values_data]
#         if incoming_field_ids:
#             await validate_field_ids_belong_to_service_type(db, incoming_field_ids, log_data.service_type_id)

#     # 3. Create ORM objects (Log + Values) - Do NOT commit yet
#     db_log = MaintenanceLog(**main_log_data, vehicle_id=vehicle_id)
#     db.add(db_log)

#     # Flush to get db_log.id before creating values that depend on it
#     await db.flush([db_log]) # Flushes pending changes and populates db_log.id

#     if custom_values_data:
#         db_values = [
#             CustomFieldValue(
#                 log_id=db_log.id, # Use the flushed ID
#                 field_id=fv.field_id, # Correct attribute name
#                 value=fv.value
#             ) for fv in custom_values_data
#         ]
#         db.add_all(db_values)

#     # 4. Single commit for atomicity
#     await db.commit()
#     # db_log object now contains the committed data, including its ID

#     # 5. Refresh relationships if needed, or re-fetch full graph
#     # Option A: Refresh the log object (might not load all relationships needed by schema)
#     # await db.refresh(db_log, attribute_names=['service_type', 'custom_field_values']) # Specify relationships if needed

#     # Option B: Re-fetch using the detail getter (guarantees schema compliance)
#     complete_log = await _get_maintenance_log_detail(db, db_log.id)
#     if not complete_log:
#         # This indicates a serious issue if commit succeeded but fetch failed
#         raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve created log after commit")

#     return complete_log

# async def get_logs_for_vehicle(db: AsyncSession, vehicle_id: int, service_type_id: Optional[int] = None) -> List[MaintenanceLog]:
#     """Gets all maintenance logs for a specific vehicle, optionally filtered by service_type_id."""
#     # Ensure vehicle exists
#     vehicle_check = await db.get(Vehicle, vehicle_id)
#     if not vehicle_check:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICLE_NOT_FOUND)

#     # result = await db.execute(
#     #     select(MaintenanceLog)
#     #     .options(
#     #         # Use selectinload for collections
#     #         joinedload(MaintenanceLog.service_type)
#     #             .joinedload(ServiceType.fields),
#     #         joinedload(MaintenanceLog.custom_field_values)
#     #             .joinedload(CustomFieldValue.custom_field)
#     #     )
#     #     .where(MaintenanceLog.vehicle_id == vehicle_id)
#     #     .order_by(MaintenanceLog.date.desc(), MaintenanceLog.id.desc()) 
#     # )
    
#     stmt = select(MaintenanceLog).where(MaintenanceLog.vehicle_id == vehicle_id)

#     if service_type_id is not None:
#         stmt = stmt.where(MaintenanceLog.service_type_id == service_type_id)
#         # Optional: Check if service_type_id is valid for this vehicle,
#         # or just return empty if no logs match (current behavior).
#         # service_type_check = await db.get(ServiceType, service_type_id)
#         # if not service_type_check:
#         #     # Or raise a specific error if service_type_id itself is invalid
#         #     return [] 

#     stmt = stmt.options(
#         joinedload(MaintenanceLog.service_type).joinedload(ServiceType.fields),
#         joinedload(MaintenanceLog.custom_field_values).joinedload(CustomFieldValue.custom_field)
#     ).order_by(MaintenanceLog.date.desc(), MaintenanceLog.id.desc())
    
#     result = await db.execute(stmt)
    
#     return result.unique().scalars().all()

# async def get_filtered_maintenance_logs(
#     db: AsyncSession,
#     vehicle_id: Optional[int] = None,
#     start_date: Optional[date] = None,
#     end_date: Optional[date] = None,
#     min_mileage: Optional[int] = None,
#     max_mileage: Optional[int] = None,
#     service_type: Optional[str] = None,
# ) -> List[MaintenanceLog]:

#     filters = []

#     if vehicle_id is not None:
#         filters.append(MaintenanceLog.vehicle_id == vehicle_id)
#     if start_date is not None:
#         filters.append(MaintenanceLog.date >= start_date)
#     if end_date is not None:
#         filters.append(MaintenanceLog.date <= end_date)
#     if min_mileage is not None:
#         filters.append(MaintenanceLog.mileage >= min_mileage)
#     if max_mileage is not None:
#         filters.append(MaintenanceLog.mileage <= max_mileage)
#     if service_type is not None:
#         filters.append(ServiceType.name == service_type)

#     stmt = (
#         select(MaintenanceLog)
#         .join(ServiceType, MaintenanceLog.service_type)
#         .options(
#             joinedload(MaintenanceLog.custom_field_values).joinedload(CustomFieldValue.custom_field),
#             joinedload(MaintenanceLog.service_type),
#         )
#     )

#     if filters:
#         stmt = stmt.where(and_(*filters))

#     result = await db.execute(stmt)
#     return result.scalars().all()

# async def get_maintenance_summary_by_service_type(db: AsyncSession, vehicle_id: int) -> List[dict]: # Using dict for now, will map to schema in route
#     """
#     Generates a summary of maintenance logs for a given vehicle, grouped by service type.
#     For each service type, it provides the count of logs, the date of the last log,
#     and the mileage at the last log.
#     """
#     # Step 1: Ensure vehicle exists
#     vehicle = await db.get(Vehicle, vehicle_id)
#     if not vehicle:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=VEHICLE_NOT_FOUND)

#     # Step 2: Subquery to rank logs within each service_type for the vehicle
#     # This helps us pick the 'latest' log (by date, then by ID as a tie-breaker)
#     log_alias = aliased(MaintenanceLog, name="log_ranked")
#     ranked_logs_subquery = (
#         select(
#             log_alias.id.label("log_id"),
#             log_alias.service_type_id,
#             log_alias.date,
#             log_alias.mileage,
#             func.row_number()
#             .over(
#                 partition_by=log_alias.service_type_id,
#                 order_by=[desc(log_alias.date), desc(log_alias.id)], # Latest date, then latest ID
#             )
#             .label("rnk"),
#         )
#         .where(log_alias.vehicle_id == vehicle_id)
#         .where(log_alias.service_type_id.is_not(None)) # Only consider logs with a service type
#         .subquery("ranked_logs")
#     )

#     # Step 3: Main query to aggregate counts and join with the latest log data
#     # We also need the ServiceType name
#     service_type_alias = aliased(ServiceType)
    
#     stmt = (
#         select(
#             MaintenanceLog.service_type_id,
#             service_type_alias.name.label("service_type_name"),
#             func.count(MaintenanceLog.id).label("log_count"),
#             ranked_logs_subquery.c.date.label("last_log_date"),
#             ranked_logs_subquery.c.mileage.label("last_log_mileage"),
#         )
#         .join(service_type_alias, MaintenanceLog.service_type_id == service_type_alias.id)
#         .join(
#             ranked_logs_subquery,
#             and_(
#                 MaintenanceLog.service_type_id == ranked_logs_subquery.c.service_type_id,
#                 ranked_logs_subquery.c.rnk == 1, # Pick only the latest log per service_type
#             ),
#             isouter=True # Use outer join in case a service type has logs but somehow the rank fails (should not happen with rnk=1 filter)
#                         # Or, if we want to list all service types associated with vehicle even if no logs (then filter subquery for rnk=1 later)
#                         # For now, assuming we only want service types that *have* logs.
#                         # If we only want to count logs and then get latest, an INNER JOIN is fine.
#         )
#         .where(MaintenanceLog.vehicle_id == vehicle_id)
#         .where(MaintenanceLog.service_type_id.is_not(None))
#         .group_by(
#             MaintenanceLog.service_type_id,
#             service_type_alias.name,
#             ranked_logs_subquery.c.date, # Must group by these as they are selected and not aggregated
#             ranked_logs_subquery.c.mileage,
#         )
#         .order_by(service_type_alias.name) # Order by service type name for consistent output
#     )
    
#     result = await db.execute(stmt)
    
#     # The result rows will have: service_type_id, service_type_name, log_count, last_log_date, last_log_mileage
#     # We can directly map these to our Pydantic schema in the route handler or here.
#     # For direct mapping, ensure Pydantic model field names match the labels in the query.
    
#     summaries = []
#     for row in result.mappings().all(): # .mappings() gives dict-like rows
#         summaries.append(
#             ServiceTypeLogSummary(
#                 service_type_id=row["service_type_id"],
#                 service_type_name=row["service_type_name"],
#                 log_count=row["log_count"],
#                 last_log_date=row["last_log_date"],
#                 last_log_mileage=row["last_log_mileage"],
#             )
#         )
#     return summaries

# # ─────────────────────────────────────────────
# # SERVICE TYPE + CUSTOM FIELDS CRUD
# # ─────────────────────────────────────────────

# async def create_service_type(db: AsyncSession, service_type_data: ServiceTypeCreate) -> ServiceType:
#     """Creates a service type and its associated custom fields."""
#     # Check for existing name
#     existing = await db.execute(select(ServiceType.id).where(ServiceType.name == service_type_data.name))
#     if existing.scalar_one_or_none():
#         raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Service type '{service_type_data.name}' already exists.")

#     db_service_type = ServiceType(name=service_type_data.name)
#     db.add(db_service_type)

#     # Flush to get ID for fields
#     await db.flush([db_service_type])

#     if service_type_data.fields:
#         # Check for duplicate field names within the request
#         field_names = [field.name for field in service_type_data.fields]
#         if len(field_names) != len(set(field_names)):
#             raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate custom field names provided for this service type.")

#         custom_fields = [
#             CustomField(
#                 name=field.name,
#                 field_type=field.field_type,
#                 unit=field.unit, # Added unit if present in schema
#                 service_type_id=db_service_type.id
#             )
#             for field in service_type_data.fields
#         ]
#         db.add_all(custom_fields)

#     # Single commit
#     await db.commit()
#     # Refresh necessary attributes (like the fields collection)
#     await db.refresh(db_service_type, attribute_names=['fields'])

#     return db_service_type

# async def get_service_types(db: AsyncSession) -> List[ServiceType]:
#     """Gets all service types, including their custom fields."""
#     result = await db.execute(
#         select(ServiceType)
#         .options(selectinload(ServiceType.fields)) # selectinload is good here
#         .order_by(ServiceType.name) # Add ordering
#     )
#     return result.scalars().all()

# async def get_service_type_by_id(db: AsyncSession, service_type_id: int) -> ServiceType:
#     """Gets a single service type by ID, including its custom fields."""
#     result = await db.execute(
#         select(ServiceType)
#         .where(ServiceType.id == service_type_id)
#         .options(selectinload(ServiceType.fields)) # selectinload is good
#     )
#     service_type = result.scalar_one_or_none()

#     if not service_type:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=SERVICE_TYPE_NOT_FOUND)

#     return service_type

# async def update_service_type_by_id(db: AsyncSession, service_type_id: int, updated_data: ServiceTypeUpdate):
#     result = await db.execute(
#         select(ServiceType).where(ServiceType.id == service_type_id).options(selectinload(ServiceType.fields))
#     )
#     service_type = result.scalar_one_or_none()

#     if not service_type:
#         raise HTTPException(status_code=404, detail="Service type not found")

#     if updated_data.name is not None:
#         service_type.name = updated_data.name

#     if updated_data.fields is not None:
#         existing_fields = {field.name: field for field in service_type.fields}
#         incoming_fields = {field.name: field for field in updated_data.fields}

#         for field_name in set(existing_fields) - set(incoming_fields):
#             await db.delete(existing_fields[field_name])

#         for field_name, new_field in incoming_fields.items():
#             if field_name in existing_fields:
#                 existing_fields[field_name].field_type = new_field.field_type
#             else:
#                 db.add(CustomField(
#                     name=new_field.name,
#                     field_type=new_field.field_type,
#                     service_type_id=service_type.id
#                 ))

#     await db.commit()
#     await db.refresh(service_type)
#     return service_type

# async def delete_service_type_by_id(db: AsyncSession, service_type_id: int):
#     result = await db.execute(
#         select(ServiceType).where(ServiceType.id == service_type_id)
#     )
#     service_type = result.scalar_one_or_none()

#     if not service_type:
#         raise HTTPException(status_code=404, detail="Service type not found")

#     await db.delete(service_type)
#     await db.commit()

# # ─────────────────────────────────────────────
# # CUSTOM FIELD CRUD
# # ─────────────────────────────────────────────

# async def create_custom_field(db: AsyncSession, field_data: CustomFieldCreate, service_type_id: int) -> CustomField:
#     """Creates a single custom field for a given service type."""
#     # Check if service type exists
#     service_type = await db.get(ServiceType, service_type_id)
#     if not service_type:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=SERVICE_TYPE_NOT_FOUND)

#     # Check if field name already exists for this service type
#     existing_field = await db.execute(
#         select(CustomField.id).where(
#             CustomField.service_type_id == service_type_id,
#             CustomField.name == field_data.name
#         )
#     )
#     if existing_field.scalar_one_or_none():
#         raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Custom field '{field_data.name}' already exists for this service type.")

#     new_field = CustomField(**field_data.model_dump(), service_type_id=service_type_id)
#     db.add(new_field)
#     await db.commit()
#     await db.refresh(new_field)
#     return new_field

# async def get_custom_fields_for_service_type(db: AsyncSession, service_type_id: int) -> List[CustomField]:
#     """Gets all custom fields for a specific service type."""
#     # Optional: Check if service type exists first
#     service_type = await db.get(ServiceType, service_type_id)
#     if not service_type:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=SERVICE_TYPE_NOT_FOUND)

#     result = await db.execute(
#         select(CustomField)
#         .where(CustomField.service_type_id == service_type_id)
#         .order_by(CustomField.name) # Add ordering
#     )
#     return result.scalars().all()

# # ─────────────────────────────────────────────
# # CUSTOM FIELD VALUE CRUD
# # ─────────────────────────────────────────────

# async def set_custom_field_values(db: AsyncSession, log_id: int, field_values_data: List[CustomFieldValueCreate]):
#     """
#     Sets (replaces) the custom field values for a given maintenance log.
#     Ensures atomicity by deleting old and inserting new in one transaction.
#     """
#     # Check if the log exists first
#     log_exists = await db.get(MaintenanceLog, log_id)
#     if not log_exists:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=LOG_NOT_FOUND)

#     # 1. Clear existing values for this log using ORM delete
#     await db.execute(
#         delete(CustomFieldValue).where(CustomFieldValue.log_id == log_id)
#     )

#     # 2. Prepare and add new values (if any)
#     if field_values_data:
#         # Optional: Add validation here to ensure field_ids *exist* and belong to the log's service type
#         # This is partially covered by validate_field_ids_belong_to_service_type called earlier,
#         # but could be double-checked here against log_exists.service_type_id if needed.

#         values_to_add = [
#             CustomFieldValue(
#                 log_id=log_id,                
#                 field_id=val.field_id,         
#                 value=val.value
#             ) for val in field_values_data
#         ]
#         db.add_all(values_to_add)

#     # 3. Single commit for the delete + insert operation
#     await db.commit()

# async def update_custom_field_values_for_log(db: AsyncSession, log_id: int, field_values: List[CustomFieldValueCreate]):
#     await set_custom_field_values(db, log_id, field_values)

# async def validate_field_ids_belong_to_service_type(db: AsyncSession, field_ids: List[int], service_type_id: int):
#     """Ensures all provided custom field IDs belong to the specified service type."""
#     if not field_ids: # No IDs to validate
#         return

#     result = await db.execute(
#         select(CustomField.id).where(
#             CustomField.service_type_id == service_type_id,
#             CustomField.id.in_(field_ids) # Use .in_ for efficiency
#         )
#     )
#     valid_ids_for_service_type = {row[0] for row in result.all()}
#     provided_ids = set(field_ids)

#     invalid_ids = provided_ids - valid_ids_for_service_type

#     if invalid_ids:
#         raise HTTPException(
#             status_code=status.HTTP_400_BAD_REQUEST, # Use 400 for bad client input
#             detail=f"Custom fields with IDs {list(invalid_ids)} do not belong to ServiceType {service_type_id}"
#         )

# async def get_field_values_for_log(db: AsyncSession, log_id: int) -> List[CustomFieldValue]:
#     """Gets all custom field values for a specific log, including the field definition."""
#     # Optional: Check if log exists
#     log_exists = await db.get(MaintenanceLog, log_id)
#     if not log_exists:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=LOG_NOT_FOUND)

#     result = await db.execute(
#         select(CustomFieldValue)
#         .options(selectinload(CustomFieldValue.custom_field)) # Use selectinload here
#         .where(CustomFieldValue.log_id == log_id) # Correct attribute name
#         .order_by(CustomFieldValue.id) # Add ordering
#     )
#     return result.scalars().all()
