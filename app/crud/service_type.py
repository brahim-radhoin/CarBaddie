from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List

from app.models.base import ServiceType, CustomField, service_type_resets, service_type_suggestions
from app.schemas import ServiceTypeCreate, ServiceTypeUpdate
from fastapi import HTTPException, status

SERVICE_TYPE_NOT_FOUND = "Service type not found"

async def create_service_type(db: AsyncSession, service_type_data: ServiceTypeCreate) -> ServiceType:
    """
    Creates a service type and its associated custom fields in the session, but does NOT commit.
    """
    # Check for existing service type with the same name
    existing = await db.execute(select(ServiceType.id).where(ServiceType.name == service_type_data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Service type '{service_type_data.name}' already exists.")

    # Create the main ServiceType object from the Pydantic schema
    db_service_type = ServiceType(
        name=service_type_data.name,
        recommended_interval_km=service_type_data.recommended_interval_km,
        recommended_interval_days=service_type_data.recommended_interval_days
    )
    db.add(db_service_type)
    # Flush to send the INSERT to the DB and get the new ID for the service type
    await db.flush()

    # Create associated custom fields if they were provided
    if service_type_data.fields:
        field_names = [field.name for field in service_type_data.fields]
        if len(field_names) != len(set(field_names)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate custom field names provided.")

        custom_fields = [
            CustomField(
                name=field.name,
                field_type=field.field_type,
                unit=field.unit,
                service_type_id=db_service_type.id  # Use the new ID
            )
            for field in service_type_data.fields
        ]
        db.add_all(custom_fields)
        # Flush again to process the new fields within the same transaction
        await db.flush()

    # Handle resets and suggestions via association table inserts instead of
    # relationship assignment (avoids MissingGreenlet lazy-load on set)
    if service_type_data.resets:
        for reset_id in service_type_data.resets:
            await db.execute(
                service_type_resets.insert().values(parent_id=db_service_type.id, reset_id=reset_id)
            )
        
    if service_type_data.suggestions:
        for suggestion_id in service_type_data.suggestions:
            await db.execute(
                service_type_suggestions.insert().values(parent_id=db_service_type.id, suggestion_id=suggestion_id)
            )

    await db.flush()
    return db_service_type

async def get_service_types(db: AsyncSession) -> List[ServiceType]:
    """Gets all service types, including their custom fields, resets, and suggestions."""
    result = await db.execute(
        select(ServiceType)
        .options(
            selectinload(ServiceType.fields),
            selectinload(ServiceType.resets),
            selectinload(ServiceType.suggestions)
        )
        .order_by(ServiceType.name)
    )
    return result.scalars().all()

async def get_service_type_by_id(db: AsyncSession, service_type_id: int) -> ServiceType:
    """Gets a single service type by ID, including its custom fields. Raises 404 if not found."""
    result = await db.execute(
        select(ServiceType)
        .where(ServiceType.id == service_type_id)
        .options(
            selectinload(ServiceType.fields),
            selectinload(ServiceType.resets),
            selectinload(ServiceType.suggestions)
        )
    )
    service_type = result.scalar_one_or_none()
    if not service_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=SERVICE_TYPE_NOT_FOUND)
    return service_type

async def update_service_type_by_id(db: AsyncSession, service_type_id: int, updated_data: ServiceTypeUpdate) -> ServiceType:
    """
    Updates a service type and its fields in the session, but does NOT commit.
    """
    # Use the getter which includes a 404 check and loads the fields relationship
    service_type = await get_service_type_by_id(db, service_type_id)

    # Update scalar properties (name, intervals) from the Pydantic model
    update_data_dict = updated_data.model_dump(exclude_unset=True, exclude={'fields', 'resets', 'suggestions'})
    for key, value in update_data_dict.items():
        setattr(service_type, key, value)

    # Handle replacement of custom fields if the 'fields' key was provided in the update
    if updated_data.fields is not None:
        # A simple and safe replace strategy: delete all old fields, then create all new ones.
        for field in service_type.fields:
            await db.delete(field)
        await db.flush() # Process the deletions in the transaction

        new_fields = [
            CustomField(
                name=new_field.name,
                field_type=new_field.field_type,
                unit=new_field.unit,
                service_type_id=service_type.id
            )
            for new_field in updated_data.fields
        ]
        db.add_all(new_fields)
    
    # Handle resets via association table (avoids MissingGreenlet)
    if updated_data.resets is not None:
        await db.execute(
            service_type_resets.delete().where(service_type_resets.c.parent_id == service_type_id)
        )
        for reset_id in updated_data.resets:
            await db.execute(
                service_type_resets.insert().values(parent_id=service_type_id, reset_id=reset_id)
            )

    # Handle suggestions via association table (avoids MissingGreenlet)
    if updated_data.suggestions is not None:
        await db.execute(
            service_type_suggestions.delete().where(service_type_suggestions.c.parent_id == service_type_id)
        )
        for suggestion_id in updated_data.suggestions:
            await db.execute(
                service_type_suggestions.insert().values(parent_id=service_type_id, suggestion_id=suggestion_id)
            )

    # Flush all staged changes (scalar updates, new fields)
    await db.flush()
    return service_type

async def delete_service_type_by_id(db: AsyncSession, service_type_id: int) -> None:
    """
    Stages a service type for deletion in the session, but does NOT commit.
    """
    service_type = await get_service_type_by_id(db, service_type_id)
    await db.delete(service_type)
    # Flush to ensure the deletion is registered in the session and cascades are prepared
    await db.flush()