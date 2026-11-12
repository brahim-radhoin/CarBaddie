from sqlalchemy import Boolean, Column, Integer, String, Date, Float, Text, ForeignKey, UniqueConstraint, Table
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    make = Column(String, nullable=False)
    model = Column(String, nullable=False)
    year = Column(Integer, nullable=True)
    vin = Column(String, unique=True, nullable=True)
    initial_mileage = Column(Integer, nullable=True)
    acquisition_date = Column(Date, nullable=True) 

    maintenance_logs = relationship("MaintenanceLog", back_populates="vehicle", cascade="all, delete-orphan")
    interval_overrides = relationship("VehicleServiceIntervalOverride", cascade="all, delete-orphan") 


class MaintenanceLog(Base):
    __tablename__ = "maintenance_logs"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id", ondelete="CASCADE"), index=True, nullable=False)
    service_type_id = Column(Integer, ForeignKey("service_types.id", ondelete="SET NULL"), index=True, nullable=True)
    date = Column(Date)
    mileage = Column(Integer)
    cost = Column(Float)
    notes = Column(Text)

    vehicle = relationship("Vehicle", back_populates="maintenance_logs")
    service_type = relationship("ServiceType", back_populates="logs")
    custom_field_values = relationship("CustomFieldValue", back_populates="maintenance_log", cascade="all, delete-orphan")


service_type_resets = Table(
    'service_type_resets', Base.metadata,
    Column('parent_id', Integer, ForeignKey('service_types.id', ondelete='CASCADE'), primary_key=True),
    Column('reset_id', Integer, ForeignKey('service_types.id', ondelete='CASCADE'), primary_key=True)
)

service_type_suggestions = Table(
    'service_type_suggestions', Base.metadata,
    Column('parent_id', Integer, ForeignKey('service_types.id', ondelete='CASCADE'), primary_key=True),
    Column('suggestion_id', Integer, ForeignKey('service_types.id', ondelete='CASCADE'), primary_key=True)
)

class ServiceType(Base):
    __tablename__ = "service_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

    recommended_interval_km = Column(Integer, nullable=True)
    recommended_interval_days = Column(Integer, nullable=True)

    logs = relationship("MaintenanceLog", back_populates="service_type")
    fields = relationship(
        "CustomField",
        back_populates="service_type",
        cascade="all, delete-orphan"
    )
    resets = relationship(
        "ServiceType",
        secondary=service_type_resets,
        primaryjoin="ServiceType.id == service_type_resets.c.parent_id",
        secondaryjoin="ServiceType.id == service_type_resets.c.reset_id",
        backref="reset_by"
    )
    suggestions = relationship(
        "ServiceType",
        secondary=service_type_suggestions,
        primaryjoin="ServiceType.id == service_type_suggestions.c.parent_id",
        secondaryjoin="ServiceType.id == service_type_suggestions.c.suggestion_id",
        backref="suggested_by"
    )

class CustomField(Base):
    __tablename__ = "custom_fields"
    __table_args__ = (
        UniqueConstraint("service_type_id", "name", name="uq_field_per_service_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    service_type_id = Column(Integer, ForeignKey("service_types.id", ondelete="CASCADE"), index=True, nullable=False)
    name = Column(String, nullable=False)
    field_type = Column(String, nullable=False)
    unit = Column(String)
    required = Column(Boolean, default=False, nullable=False) # Add this
    sort_order = Column(Integer, default=0, nullable=False)
    default_value = Column(Text, nullable=True) 

    service_type = relationship("ServiceType", back_populates="fields")
    field_values = relationship("CustomFieldValue", back_populates="custom_field", cascade="all, delete-orphan")


class CustomFieldValue(Base):
    __tablename__ = "custom_field_values"

    id = Column(Integer, primary_key=True, index=True)
    field_id = Column(Integer, ForeignKey("custom_fields.id", ondelete="CASCADE"), index=True, nullable=False)
    log_id = Column(Integer, ForeignKey("maintenance_logs.id", ondelete="CASCADE"), index=True, nullable=False)
    value = Column(Text, nullable=False)

    custom_field = relationship("CustomField", back_populates="field_values", foreign_keys=[field_id])
    maintenance_log = relationship("MaintenanceLog", back_populates="custom_field_values", foreign_keys=[log_id])

class VehicleServiceIntervalOverride(Base):
    __tablename__ = "vehicle_service_interval_overrides"

    id = Column(Integer, primary_key=True, index=True)
    
    vehicle_id = Column(Integer, ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    service_type_id = Column(Integer, ForeignKey("service_types.id", ondelete="CASCADE"), nullable=False, index=True)
    
    override_interval_km = Column(Integer, nullable=True)  # Can be null if only overriding days or clearing km
    override_interval_days = Column(Integer, nullable=True) # Can be null if only overriding km or clearing days

    # Relationships (optional, but can be useful)
    # vehicle = relationship("Vehicle", back_populates="interval_overrides") # Add "interval_overrides" to Vehicle model
    # service_type = relationship("ServiceType") # Simpler relationship if not back-populating

    __table_args__ = (
        UniqueConstraint("vehicle_id", "service_type_id", name="uq_vehicle_service_type_override"),
    )
