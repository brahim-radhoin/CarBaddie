import pytest
from httpx import AsyncClient
from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Vehicle

pytestmark = pytest.mark.asyncio

# --- Test POST /vehicles/ ---

async def test_create_vehicle_success(test_client: AsyncClient):
    vehicle_data = {
        "make": "Toyota",
        "model": "Camry",
        "year": 2021,
        "vin": "12345ABCDE67890FG"
    }
    response = await test_client.post("/vehicles/", json=vehicle_data)
    assert response.status_code == status.HTTP_201_CREATED
    response_data = response.json()
    assert response_data["make"] == "Toyota"
    assert "id" in response_data

async def test_create_vehicle_duplicate_vin(test_client: AsyncClient):
    # Arrange: Use a guaranteed valid 17-char VIN
    valid_vin = "ABCDEFGHJ12345678"
    initial_data = {
        "make": "Honda",
        "model": "Crvc",
        "vin": valid_vin
    }
    response1 = await test_client.post("/vehicles/", json=initial_data)
    assert response1.status_code == status.HTTP_201_CREATED, "Setup failed"

    # Act
    duplicate_data = {
        "make": "Honda",
        "model": "Accord",
        "vin": valid_vin
    }
    response2 = await test_client.post("/vehicles/", json=duplicate_data)

    # Assert
    assert response2.status_code == status.HTTP_409_CONFLICT

async def test_create_vehicle_invalid_vin(test_client: AsyncClient):
    # Test with an invalid character 'Q'
    invalid_data = {"make": "Ford", "model": "Focus", "vin": "123456789Q1234567"}
    response = await test_client.post("/vehicles/", json=invalid_data)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

# --- Test GET /vehicles/ ---

async def test_list_vehicles_empty(test_client: AsyncClient):
    response = await test_client.get("/vehicles/")
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == []

async def test_list_vehicles_with_data(test_client: AsyncClient):
    await test_client.post("/vehicles/", json={"make": "Subaru", "model": "Outback"})
    await test_client.post("/vehicles/", json={"make": "Nssan", "model": "Ttan"})
    response = await test_client.get("/vehicles/")
    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) == 2

# --- Test GET /vehicles/{vehicle_id} ---

async def test_get_vehicle_by_id(test_client: AsyncClient):
    create_response = await test_client.post("/vehicles/", json={"make": "Mazda", "model": "CX-5"})
    vehicle_id = create_response.json()["id"]
    response = await test_client.get(f"/vehicles/{vehicle_id}")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["id"] == vehicle_id

async def test_get_nonexistent_vehicle(test_client: AsyncClient):
    response = await test_client.get("/vehicles/99999")
    assert response.status_code == status.HTTP_404_NOT_FOUND

# --- Test PUT /vehicles/{vehicle_id} ---

async def test_update_vehicle_success(test_client: AsyncClient, db_session: AsyncSession):
    create_response = await test_client.post("/vehicles/", json={"make": "Kya", "model": "Tellurde", "year": 2022})
    vehicle_id = create_response.json()["id"]
    update_data = {"model": "Sorento", "year": 2023}
    response = await test_client.put(f"/vehicles/{vehicle_id}", json=update_data)
    assert response.status_code == status.HTTP_200_OK
    updated_db_vehicle = await db_session.get(Vehicle, vehicle_id)
    assert updated_db_vehicle.model == "Sorento"

async def test_update_vehicle_conflict_vin(test_client: AsyncClient):
    # Arrange: Use two different, guaranteed valid 17-char VINs
    existing_vin = "ABCDEFGHJ12345678"
    unique_vin =   "ABCDEFGHJ87654321"
    
    response1 = await test_client.post("/vehicles/", json={"make": "Vehicle One", "model": "A", "vin": existing_vin})
    assert response1.status_code == status.HTTP_201_CREATED, "Setup failed: Vehicle 1"
    
    response2 = await test_client.post("/vehicles/", json={"make": "Vehicle Two", "model": "B", "vin": unique_vin})
    assert response2.status_code == status.HTTP_201_CREATED, "Setup failed: Vehicle 2"
    vehicle2_id = response2.json()["id"]

    # Act
    response3 = await test_client.put(f"/vehicles/{vehicle2_id}", json={"vin": existing_vin})

    # Assert
    assert response3.status_code == status.HTTP_409_CONFLICT

async def test_update_nonexistent_vehicle(test_client: AsyncClient):
    response = await test_client.put("/vehicles/99999", json={"make": "Ghost"})
    assert response.status_code == status.HTTP_404_NOT_FOUND

# --- Test DELETE /vehicles/{vehicle_id} ---

async def test_delete_vehicle_success(test_client: AsyncClient, db_session: AsyncSession):
    create_response = await test_client.post("/vehicles/", json={"make": "Hyundai", "model": "Sonata"})
    vehicle_id = create_response.json()["id"]
    response = await test_client.delete(f"/vehicles/{vehicle_id}")
    assert response.status_code == status.HTTP_204_NO_CONTENT
    deleted_vehicle = await db_session.get(Vehicle, vehicle_id)
    assert deleted_vehicle is None

async def test_delete_nonexistent_vehicle(test_client: AsyncClient):
    response = await test_client.delete("/vehicles/99999")
    assert response.status_code == status.HTTP_404_NOT_FOUND