from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from app.models.base import ServiceType, CustomField
from app.schemas import CustomFieldCreate
from fastapi import HTTPException, status

SERVICE_TYPE_NOT_FOUND = "Service type not found"

async def create_custom_field(db: AsyncSession, field_data: CustomFieldCreate, service_type_id: int) -> CustomField:
    """
    Creates a single custom field for a service type in the session, but does NOT commit.
    """
    # Check if the parent service type exists
    service_type = await db.get(ServiceType, service_type_id)
    if not service_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=SERVICE_TYPE_NOT_FOUND)

    # Check if a field with the same name already exists for this service type
    existing_field = await db.execute(
        select(CustomField.id).where(
            CustomField.service_type_id == service_type_id,
            CustomField.name == field_data.name
        )
    )
    if existing_field.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Custom field '{field_data.name}' already exists for this service type.")

    new_field = CustomField(**field_data.model_dump(), service_type_id=service_type_id)
    db.add(new_field)
    
    # Flush to send the INSERT to the DB and get an ID for the new field
    await db.flush()
    # Refresh the instance to load its state from the database
    await db.refresh(new_field)
    
    return new_field

async def get_custom_fields_for_service_type(db: AsyncSession, service_type_id: int) -> List[CustomField]:
    """Gets all custom fields for a specific service type."""
    # First, ensure the service type exists to provide a clear 404
    service_type = await db.get(ServiceType, service_type_id)
    if not service_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=SERVICE_TYPE_NOT_FOUND)

    # Then, query for its fields
    result = await db.execute(
        select(CustomField)
        .where(CustomField.service_type_id == service_type_id)
        .order_by(CustomField.name)
    )
    return result.scalars().all()