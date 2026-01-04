import pytest
from httpx import AsyncClient
from fastapi import status

from app.models.base import ServiceType # For creating test data
from sqlalchemy.ext.asyncio import AsyncSession

# Mark all tests in this file as async
# pytestmark = pytest.mark.asyncio


async def test_list_service_types_empty(test_client: AsyncClient):
    """
    Test listing service types when there are none in the database.
    """
    response = await test_client.get("/service_types/")
    
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == [] # Expect an empty list


async def test_list_service_types_with_data(test_client: AsyncClient, db_session: AsyncSession):
    """
    Test listing service types when there are some in the database.
    """
    # Arrange: Create some test data directly in the database using the test session
    st1 = ServiceType(name="Oil Change", recommended_interval_km=10000)
    st2 = ServiceType(name="Tire Rotation", recommended_interval_days=180)
    db_session.add_all([st1, st2])
    await db_session.flush()

    # Act: Make the API call
    response = await test_client.get("/service_types/")
    
    # Assert
    assert response.status_code == status.HTTP_200_OK
    
    response_data = response.json()
    assert len(response_data) == 2
    
    # Check if the data matches what we created
    # Response is ordered by name (as per our CRUD), so "Oil Change" should be first
    assert response_data[0]["name"] == "Oil Change"
    assert response_data[0]["recommended_interval_km"] == 10000
    assert response_data[0]["recommended_interval_days"] is None

    assert response_data[1]["name"] == "Tire Rotation"
    assert response_data[1]["recommended_interval_km"] is None
    assert response_data[1]["recommended_interval_days"] == 180