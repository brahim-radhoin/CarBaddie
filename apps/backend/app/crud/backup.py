from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload, subqueryload
from sqlalchemy import and_, delete
from typing import List
from datetime import datetime, timezone

from app.models.base import Vehicle, MaintenanceLog, ServiceType, CustomField, CustomFieldValue, VehicleServiceIntervalOverride
from app.schemas import BackupAnalysisResponse, BackupConfiguration, BackupConflictInfo, BackupVehicleInfo, FullBackupData, BackupMetadata, RestorePlan

async def get_configured_backup_data(db: AsyncSession, config: BackupConfiguration) -> FullBackupData:
    """
    Assembles a complete, filtered snapshot of user data based on a configuration.
    """
    # 1. Fetch all Service Types (we always include these for context)
    service_types_result = await db.execute(
        select(ServiceType).options(
            selectinload(ServiceType.fields),
            selectinload(ServiceType.resets),
            selectinload(ServiceType.suggestions)
        )
    )
    all_service_types = service_types_result.scalars().all()

    # 2. Build the main query for Vehicles
    vehicles_query = select(Vehicle)
    if config.vehicle_ids:
        vehicles_query = vehicles_query.where(Vehicle.id.in_(config.vehicle_ids))

    # 3. Build loader options for relationships based on config
    loader_options = []

    # Eagerly load interval overrides for the selected vehicles
    loader_options.append(selectinload(Vehicle.interval_overrides))
    
    if config.include_maintenance_logs:
        # Build filters for the maintenance logs relationship
        log_filters = []
        if config.start_date:
            log_filters.append(MaintenanceLog.date >= config.start_date)
        if config.end_date:
            log_filters.append(MaintenanceLog.date <= config.end_date)
        
        # This subqueryload applies the filters ONLY to the loaded 'maintenance_logs' collection
        maintenance_logs_rel = Vehicle.maintenance_logs
        if log_filters:
            maintenance_logs_rel = maintenance_logs_rel.and_(*log_filters)
        logs_loader = subqueryload(maintenance_logs_rel)
        
        # Also load the nested relationships for each log
        logs_loader = logs_loader.options(
            selectinload(MaintenanceLog.custom_field_values).selectinload(CustomFieldValue.custom_field),
            selectinload(MaintenanceLog.service_type).selectinload(ServiceType.fields)
        )
        loader_options.append(logs_loader)
    else:
        loader_options.append(subqueryload(Vehicle.maintenance_logs.and_(MaintenanceLog.id == -1)))

    # Apply all loader options to the main vehicle query
    if loader_options:
        vehicles_query = vehicles_query.options(*loader_options)
    
    # 4. Execute the query
    vehicles_result = await db.execute(vehicles_query)
    selected_vehicles = vehicles_result.unique().scalars().all()

    # 5. Assemble the final backup object
    backup_data = FullBackupData(
        metadata=BackupMetadata(
            export_date_utc=datetime.now(timezone.utc).isoformat(),
            config_used=config
        ),
        vehicles=selected_vehicles,
        service_types=all_service_types,
    )
    
    return backup_data


def _vehicle_key(make, model, year):
    """Identity used for vehicles without a VIN: case-insensitive make/model plus year."""
    return ((make or "").strip().lower(), (model or "").strip().lower(), year)


async def analyze_backup_file(db: AsyncSession, backup_data: FullBackupData) -> BackupAnalysisResponse:
    """
    Analyzes a backup file against the current database to find new vs. conflicting vehicles.
    """
    # 1. Get all non-null VINs currently in the database
    existing_vins_query = await db.execute(select(Vehicle.vin, Vehicle.id).where(Vehicle.vin.is_not(None)))
    existing_vin_map = {vin: id for vin, id in existing_vins_query.all()}

    # Vehicles without a VIN have no stable identity across devices. Treat a backup vehicle
    # without a VIN as already present when a local VIN-less vehicle has the same
    # make/model/year, so repeated restores and Drive syncs don't duplicate it.
    no_vin_query = await db.execute(select(Vehicle.make, Vehicle.model, Vehicle.year).where(Vehicle.vin.is_(None)))
    existing_no_vin_keys = {_vehicle_key(make, model, year) for make, model, year in no_vin_query.all()}

    new_vehicles: List[BackupVehicleInfo] = []
    conflicting_vehicles: List[BackupConflictInfo] = []
    skipped_duplicates: List[BackupVehicleInfo] = []

    # 2. Iterate through vehicles from the backup file
    for vehicle_from_backup in backup_data.vehicles:
        info = BackupVehicleInfo(
            id_in_backup=vehicle_from_backup.id,
            make=vehicle_from_backup.make,
            model=vehicle_from_backup.model,
            year=vehicle_from_backup.year,
            vin=vehicle_from_backup.vin,
            log_count=len(vehicle_from_backup.maintenance_logs)
        )

        if vehicle_from_backup.vin and vehicle_from_backup.vin in existing_vin_map:
            # Conflict found
            conflicting_vehicles.append(BackupConflictInfo(
                vin=vehicle_from_backup.vin,
                backup_vehicle=info,
                existing_vehicle_id=existing_vin_map[vehicle_from_backup.vin]
            ))
        elif not vehicle_from_backup.vin and _vehicle_key(
            vehicle_from_backup.make, vehicle_from_backup.model, vehicle_from_backup.year
        ) in existing_no_vin_keys:
            skipped_duplicates.append(info)
        else:
            # No VIN or VIN is not in the database
            new_vehicles.append(info)

    return BackupAnalysisResponse(
        new_vehicles=new_vehicles,
        conflicting_vehicles=conflicting_vehicles,
        skipped_duplicates=skipped_duplicates,
    )


async def execute_import(db: AsyncSession, backup_data: FullBackupData, plan: RestorePlan):
    """
    Executes the import based on the user's restore plan.
    This entire function should operate within a single transaction managed by the caller.
    """
    # --- Step 1: Handle Replacements ---
    # Get a list of existing vehicle IDs to delete based on the plan
    vins_to_replace = {res.vin for res in plan.conflict_resolutions if res.action == "replace"}
    if vins_to_replace:
        # Find the corresponding vehicle IDs in the current DB
        stmt_delete = select(Vehicle.id).where(Vehicle.vin.in_(vins_to_replace))
        ids_to_delete_result = await db.execute(stmt_delete)
        ids_to_delete = ids_to_delete_result.scalars().all()
        
        if ids_to_delete:
            # Since cascade is set up on the model, deleting the vehicle will delete its logs and overrides
            delete_stmt = delete(Vehicle).where(Vehicle.id.in_(ids_to_delete))
            await db.execute(delete_stmt)
            await db.flush() # Ensure deletes are processed before inserts

    # --- Step 2: Assemble list of vehicles to create ---
    vehicles_to_create_map = {} # Use a dictionary to prevent duplicates

    # Process vehicles to add based on the restore plan
    vehicles_to_add_set = set(plan.vehicles_to_add)
    for v_from_backup in backup_data.vehicles:
        if v_from_backup.id in vehicles_to_add_set:
            vehicles_to_create_map[v_from_backup.id] = v_from_backup

    # Process vehicles to replace based on the restore plan
    vins_to_replace_set = {res.vin for res in plan.conflict_resolutions if res.action == "replace"}
    for v_from_backup in backup_data.vehicles:
        if v_from_backup.vin in vins_to_replace_set:
            # This will either add a new vehicle or overwrite an existing one in the map,
            # which is fine since the object is the same.
            vehicles_to_create_map[v_from_backup.id] = v_from_backup
            
    vehicles_to_create_from_backup = list(vehicles_to_create_map.values())

    if not vehicles_to_create_from_backup:
        return # Nothing to do

    # --- Step 3: Re-create data, mapping old IDs to new IDs ---
    # We must always re-create service types to map their old IDs to new ones
    old_to_new_service_type_map = {}
    old_to_new_custom_field_map = {}
    
    for st_from_backup in backup_data.service_types:
        # Check if service type already exists by name
        existing_st_res = await db.execute(select(ServiceType).where(ServiceType.name == st_from_backup.name).options(selectinload(ServiceType.fields)))
        existing_st = existing_st_res.scalar_one_or_none()
        
        new_st_id = None
        if existing_st:
            new_st_id = existing_st.id
        else:
            # Create the missing ServiceType
            new_st = ServiceType(
                name=st_from_backup.name, 
                recommended_interval_km=st_from_backup.recommended_interval_km, 
                recommended_interval_days=st_from_backup.recommended_interval_days
            )
            db.add(new_st)
            await db.flush([new_st]) # Flush to get the new ID
            new_st_id = new_st.id
        
        old_to_new_service_type_map[st_from_backup.id] = new_st_id
        
        for field_from_backup in st_from_backup.fields:
            # Find if this field already exists on the service type in the DB
            existing_field = next((f for f in (existing_st.fields if existing_st else []) if f.name == field_from_backup.name), None)

            new_field_id = None
            if existing_field:
                new_field_id = existing_field.id
            else:
                # Create the missing CustomField definition
                new_field = CustomField(
                    service_type_id=new_st_id, # Use the NEW service type ID
                    name=field_from_backup.name,
                    field_type=field_from_backup.field_type,
                    unit=field_from_backup.unit
                    # NOTE: We are not importing 'required', 'sort_order', etc. for now, but a full implementation would.
                )
                db.add(new_field)
                await db.flush([new_field]) # Flush to get the new field ID
                new_field_id = new_field.id
            
            # Map the old ID from the backup to the new ID from the database
            old_to_new_custom_field_map[field_from_backup.id] = new_field_id

    # --- Step 4: Re-create Vehicles, Logs, Custom Field Values, and Overrides ---
    for v_from_backup in vehicles_to_create_from_backup:
        # Create Vehicle
        new_vehicle = Vehicle(
            make=v_from_backup.make, model=v_from_backup.model, year=v_from_backup.year, vin=v_from_backup.vin,
            initial_mileage=v_from_backup.initial_mileage, acquisition_date=v_from_backup.acquisition_date
        )
        db.add(new_vehicle)
        await db.flush([new_vehicle]) # Flush to get the new_vehicle.id

        # Create Logs for this vehicle
        for log_from_backup in v_from_backup.maintenance_logs:
            # Create MaintenanceLog
            new_log = MaintenanceLog(
                vehicle_id=new_vehicle.id,
                service_type_id=old_to_new_service_type_map.get(log_from_backup.service_type_id),
                date=log_from_backup.date,
                mileage=log_from_backup.mileage,
                cost=log_from_backup.cost,
                notes=log_from_backup.notes
            )
            db.add(new_log)
            await db.flush([new_log]) # Flush to get the new_log.id

            for cfv_from_backup in log_from_backup.custom_field_values:
                # Use the custom field ID map to get the new foreign key
                new_field_id = old_to_new_custom_field_map.get(cfv_from_backup.field_id)
                
                # Only create the value if the mapping was successful
                if new_field_id:
                    new_cfv = CustomFieldValue(
                        log_id=new_log.id, # Use the NEW log ID
                        field_id=new_field_id, # Use the NEW custom field ID
                        value=cfv_from_backup.value
                    )
                    db.add(new_cfv)

        # Create Overrides for this vehicle
        for override_from_backup in v_from_backup.interval_overrides:
            new_override = VehicleServiceIntervalOverride(
                vehicle_id=new_vehicle.id,
                service_type_id=old_to_new_service_type_map.get(override_from_backup.service_type_id),
                override_interval_km=override_from_backup.override_interval_km,
                override_interval_days=override_from_backup.override_interval_days
            )
            db.add(new_override)