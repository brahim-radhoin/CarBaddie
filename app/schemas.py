from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Literal
from datetime import date, datetime, timezone 

# --------- Custom Field Schemas ---------

class CustomFieldBase(BaseModel):
    name: str
    field_type: str  # e.g., "string", "number", "boolean", "date"
    unit: Optional[str] = None

class CustomFieldCreate(CustomFieldBase):
    # If you intend to allow creation of custom fields with more attributes:
    # required: Optional[bool] = False
    # default_value: Optional[str] = None
    # sort_order: Optional[int] = 0
    pass

class CustomFieldRead(CustomFieldBase):
    id: int
    # If these are part of your CustomField model and needed in response:
    # required: bool
    # default_value: Optional[str]
    # sort_order: int
    # service_type_id: int # If you want to expose this in the CustomFieldRead schema

    model_config = {
        "from_attributes": True # Enables Pydantic to read data from ORM model attributes
    }

# --------- ServiceType Schemas ---------

class ServiceTypeBase(BaseModel):
    name: str
    recommended_interval_km: Optional[int] = Field(default=None, ge=0) 
    recommended_interval_days: Optional[int] = Field(default=None, ge=0) 

class ServiceTypeCreate(ServiceTypeBase):
    fields: List[CustomFieldCreate] = [] # Default to empty list if not provided
    resets: List[int] = []
    suggestions: List[int] = []

class ServiceTypeBasic(ServiceTypeBase):
    id: int
    fields: List[CustomFieldRead] = []

    model_config = {
        "from_attributes": True
    }

class ServiceTypeRead(ServiceTypeBasic):
    resets: List[int] = []
    suggestions: List[int] = []

    @field_validator("resets", "suggestions", mode="before")
    @classmethod
    def extract_ids(cls, v):
        if not v:
            return []
        if hasattr(v[0], "id"):
            return [item.id for item in v]
        return v

    model_config = {
        "from_attributes": True
    }

class ServiceTypeUpdate(BaseModel):
    name: Optional[str] = None
    recommended_interval_km: Optional[int] = Field(default=None, ge=0)
    recommended_interval_days: Optional[int] = Field(default=None, ge=0)
    fields: Optional[List[CustomFieldCreate]] = None # For adding/replacing fields
    resets: Optional[List[int]] = None
    suggestions: Optional[List[int]] = None

class ServiceTypeLogSummary(BaseModel):
    service_type_id: int
    service_type_name: str
    log_count: int
    last_log_date: Optional[date] = None
    last_log_mileage: Optional[int] = None
    total_cost_for_service_type: float = 0.0

    model_config = {
        "from_attributes": True # If you construct this from ORM-like objects
    }

# --------- Custom Field Value Schemas ---------

class CustomFieldValueBase(BaseModel):
    field_id: int # ID of the CustomField definition
    value: str    # Value of the custom field, always stored as string

class CustomFieldValueCreate(CustomFieldValueBase):
    pass

class CustomFieldValueRead(CustomFieldValueBase):
    id: int
    custom_field: CustomFieldRead  

    model_config = {
        "from_attributes": True
    }

# --------- MaintenanceLog Schemas ---------

class MaintenanceSummary(BaseModel):
    vehicle_id: int
    total_logs: int
    total_cost: float
    average_cost: float
    last_service_date: Optional[date] = None
    days_since_last_service: Optional[int] = None
    last_mileage: Optional[int] = None

class MaintenanceLogBase(BaseModel):
    date: date
    mileage: int
    service_type_id: Optional[int] = None
    cost: float
    notes: Optional[str] = None
    # parent_log_id: Optional[int] = None # If you plan to expose this

class MaintenanceLogCreate(MaintenanceLogBase):
    custom_field_values: Optional[List[CustomFieldValueCreate]] = []

class MaintenanceLogRead(MaintenanceLogBase):
    id: int
    vehicle_id: int # Included for clarity, though often derivable from context
    service_type: Optional[ServiceTypeBasic] = None 
    custom_field_values: List[CustomFieldValueRead] = [] # Nested list of custom field values with their definitions
    # parent_log: Optional['MaintenanceLogRead'] = None # For recursive structures, needs careful handling
    # child_logs: List['MaintenanceLogRead'] = []    # For recursive structures

    model_config = {
        "from_attributes": True
    }

# For self-referencing Pydantic models, update_forward_refs is needed after definition
# if MaintenanceLogRead includes itself (e.g., for parent_log/child_logs)
# MaintenanceLogRead.model_rebuild() # Or a more modern approach if using Pydantic v2

class MaintenanceLogUpdate(BaseModel):
    
    service_date: Optional[date] = Field(default=None, alias="date")
    # date: Optional[date] = None
    mileage: Optional[int] = None
    service_type_id: Optional[int] = None
    cost: Optional[float] = None
    notes: Optional[str] = None
    # parent_log_id: Optional[int] = None
    custom_field_values: Optional[List[CustomFieldValueCreate]] = None # Allows updating values

    model_config = {
        "populate_by_name": True, # Allows using the alias for input
        "from_attributes": True   # Allows creating from ORM model attributes
    }

# --------- Vehicle Service Interval Override Schemas ---------

class VehicleServiceIntervalOverrideBase(BaseModel):
    # vehicle_id and service_type_id will often come from path parameters
    # but good to have them if creating multiple overrides in one go, or for clarity.
    # If they are always from path, they might not be needed in the *Create body.
    override_interval_km: Optional[int] = Field(default=None, ge=0, description="Vehicle-specific interval in kilometers. Null means no override or use default.")
    override_interval_days: Optional[int] = Field(default=None, ge=0, description="Vehicle-specific interval in days. Null means no override or use default.")

class VehicleServiceIntervalOverrideCreate(VehicleServiceIntervalOverrideBase):
    # If vehicle_id and service_type_id are part of the path, they are not needed here.
    # If creating in bulk or if they are part of the body, then include them:
    # vehicle_id: int
    # service_type_id: int
    pass # Assuming vehicle_id and service_type_id come from path params for single create/update

class VehicleServiceIntervalOverrideUpdate(VehicleServiceIntervalOverrideBase):
    # All fields are optional for an update, inherited from Base making them Optional
    pass

class VehicleServiceIntervalOverrideRead(VehicleServiceIntervalOverrideBase):
    id: int
    vehicle_id: int
    service_type_id: int
    # override_interval_km and override_interval_days are inherited

    model_config = {
        "from_attributes": True
    }
    
# --------- Vehicle Schemas ---------

class VehicleBase(BaseModel):
    make: str
    model: str
    year: Optional[int] = None
    vin: Optional[str] = Field(default=None, min_length=11, max_length=17, pattern=r"^[A-HJ-NPR-Z0-9]{11,17}$")
    initial_mileage: Optional[int] = Field(default=None, ge=0)
    acquisition_date: Optional[date] = None

class VehicleCreate(VehicleBase):
    pass

class VehicleRead(VehicleBase):
    id: int
    maintenance_logs: List[MaintenanceLogRead] = []
    interval_overrides: List[VehicleServiceIntervalOverrideRead] = []

    model_config = {
        "from_attributes": True
    }

class VehicleUpdate(VehicleBase): 
    make: Optional[str] = None
    model: Optional[str] = None
    
    pass
    
# --- Backup and Restore Schemas ---
    
class BackupConfiguration(BaseModel):
    """
    Defines the user's choices for what to include in the backup.
    All fields are optional; None/null means "do not apply this filter".
    """
    # Scope Filter: Which vehicles to include.
    vehicle_ids: Optional[List[int]] = Field(default=None, description="List of specific vehicle IDs to include. If null, all vehicles are included.")

    # Time Period Filter (applies to maintenance logs)
    start_date: Optional[date] = Field(default=None, description="Include maintenance logs on or after this date.")
    end_date: Optional[date] = Field(default=None, description="Include maintenance logs on or before this date.")

    # Data Type Filters
    include_maintenance_logs: bool = Field(default=True, description="Whether to include maintenance logs for the selected vehicles.")
    
    # We will always include service types and overrides for the selected vehicles for a consistent backup.
    # An 'exclude_service_type_ids' could be added later if needed for advanced filtering.


class BackupMetadata(BaseModel):
    """
    Contains metadata about when and how the backup was generated.
    """
    export_date_utc: str = Field(description="The UTC timestamp in ISO 8601 format when the backup was created.")
    config_used: BackupConfiguration = Field(description="The configuration parameters used to generate this backup.")


class FullBackupData(BaseModel):
    """
    The top-level schema for the entire backup JSON file.
    """
    metadata: BackupMetadata
    service_types: List[ServiceTypeRead] # Always include all service types for context
    vehicles: List[VehicleRead] # This list will be filtered based on the config
    # Overrides are now part of the vehicle's data, so we don't need a separate top-level list
    # Let's add them to the VehicleRead schema instead for better encapsulation.
    
# --- Restore from Backup Schemas ---

class BackupVehicleInfo(BaseModel):
    """Minimal info about a vehicle found in the backup file."""
    id_in_backup: int # The original ID from the backup file
    make: str
    model: str
    year: Optional[int] = None
    vin: Optional[str] = None
    log_count: int

class BackupConflictInfo(BaseModel):
    """Represents a vehicle from the backup that conflicts with one in the database."""
    vin: str # The conflicting VIN
    backup_vehicle: BackupVehicleInfo
    existing_vehicle_id: int # The ID of the vehicle already in the DB

class BackupAnalysisResponse(BaseModel):
    """The response from the analysis endpoint, outlining what was found."""
    new_vehicles: List[BackupVehicleInfo]
    conflicting_vehicles: List[BackupConflictInfo]

class ConflictResolution(BaseModel):
    """Defines the user's choice for a single conflicting vehicle."""
    vin: str
    action: Literal["skip", "replace"] # For now, only allow skipping or replacing

class RestorePlan(BaseModel):
    """The final plan of action sent by the user to the execution endpoint."""
    vehicles_to_add: List[int] # List of `id_in_backup` for new vehicles the user chose to add
    conflict_resolutions: List[ConflictResolution]