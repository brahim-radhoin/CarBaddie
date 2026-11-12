from .vehicle import (
    create_vehicle,
    get_vehicle,
    get_vehicles,
    update_vehicle,
    delete_vehicle,
)
from .maintenance_log import (
    get_maintenance_summary,
    get_maintenance_log, # Replaces _get_maintenance_log_detail
    create_maintenance_log,
    delete_maintenance_log,
    update_maintenance_log,
    get_logs_for_vehicle,
    get_filtered_maintenance_logs,
    get_maintenance_summary_by_service_type,
    set_custom_field_values, # Related to logs
    get_field_values_for_log,  # Related to logs
    validate_field_ids_belong_to_service_type, # Validation helper often used with logs/service_types
)
from .service_type import (
    create_service_type,
    get_service_types,
    get_service_type_by_id,
    update_service_type_by_id,
    delete_service_type_by_id,
)
from .custom_field import (
    create_custom_field,
    get_custom_fields_for_service_type,
)

# Add __all__ if you want to control what `from app.crud import *` imports
__all__ = [
    "create_vehicle", "get_vehicle", "get_vehicles", "update_vehicle", "delete_vehicle","delete_maintenance_log",
    "get_maintenance_summary", "get_maintenance_log", "create_maintenance_log", 
    "update_maintenance_log", "get_logs_for_vehicle", "get_filtered_maintenance_logs",
    "get_maintenance_summary_by_service_type", "set_custom_field_values", 
    "get_field_values_for_log", "validate_field_ids_belong_to_service_type",
    "create_service_type", "get_service_types", "get_service_type_by_id",
    "update_service_type_by_id", "delete_service_type_by_id",
    "create_custom_field", "get_custom_fields_for_service_type",
]