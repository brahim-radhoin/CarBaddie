from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.service_type import (
    create_service_type, get_service_types, get_service_type_by_id,
    update_service_type_by_id, delete_service_type_by_id
)
from app.crud.custom_field import create_custom_field, get_custom_fields_for_service_type

from app.schemas import (
    ServiceTypeCreate, ServiceTypeRead, ServiceTypeUpdate,
    CustomFieldCreate, CustomFieldRead
)
from app.database import get_db

SERVICE_TYPE_NOT_FOUND = "Service type not found"

router = APIRouter(
    prefix="/service_types",
    tags=["Service Types"]
)

@router.post("/", response_model=ServiceTypeRead, status_code=status.HTTP_201_CREATED)
async def add_service_type_route(service_type_data: ServiceTypeCreate, db: AsyncSession = Depends(get_db)):
    """
    Creates a new service type, including its custom field definitions.
    """
    new_service_type = await create_service_type(db, service_type_data)
    await db.commit()
    # The CRUD function returns the fully refreshed object, so we can return it directly.
    return new_service_type

@router.get("/", response_model=List[ServiceTypeRead])
async def list_service_types_route(db: AsyncSession = Depends(get_db)):
    """
    Lists all available service types and their custom fields.
    """
    return await get_service_types(db)

@router.get("/{service_type_id}", response_model=ServiceTypeRead)
async def get_service_type_route(service_type_id: int, db: AsyncSession = Depends(get_db)):
    """
    Retrieves a single service type by its ID.
    """
    service_type = await get_service_type_by_id(db, service_type_id)
    # The CRUD function already raises 404 if not found.
    return service_type

@router.put("/{service_type_id}", response_model=ServiceTypeRead)
async def update_service_type_route(service_type_id: int, updated_data: ServiceTypeUpdate, db: AsyncSession = Depends(get_db)):
    """
    Updates a service type's properties and/or its custom fields.
    """
    updated_service_type = await update_service_type_by_id(db, service_type_id, updated_data)
    # The CRUD function raises 404 if not found.
    await db.commit()
    return updated_service_type

@router.delete("/{service_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service_type_route(service_type_id: int, db: AsyncSession = Depends(get_db)):
    """
    Deletes a service type and all of its associated data via cascades.
    """
    await delete_service_type_by_id(db, service_type_id)
    await db.commit()
    return

# --- Nested Custom Field Routes ---

@router.post("/{service_type_id}/custom_fields/", response_model=CustomFieldRead, status_code=status.HTTP_201_CREATED)
async def add_custom_field_route(service_type_id: int, field: CustomFieldCreate, db: AsyncSession = Depends(get_db)):
    """
    Adds a new custom field definition to an existing service type.
    """
    new_field = await create_custom_field(db, field, service_type_id)
    await db.commit()
    return new_field

@router.get("/{service_type_id}/custom_fields/", response_model=List[CustomFieldRead])
async def list_custom_fields_route(service_type_id: int, db: AsyncSession = Depends(get_db)):
    """
    Lists all custom field definitions for a specific service type.
    """
    return await get_custom_fields_for_service_type(db, service_type_id)