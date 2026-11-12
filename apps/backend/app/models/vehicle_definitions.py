from sqlalchemy import Column, Integer, String, UniqueConstraint
from sqlalchemy import Column, Integer, String, UniqueConstraint
from app.models.base import Base

class VehicleDefinition(Base):
    __tablename__ = "vehicle_definitions"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, index=True, nullable=False)
    make = Column(String, index=True, nullable=False)
    model = Column(String, index=True, nullable=False)

    # Ensure uniqueness to prevent duplicate entries
    __table_args__ = (
        UniqueConstraint('year', 'make', 'model', name='_year_make_model_uc'),
    )
