import pytest
import os
from typing import AsyncGenerator

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker, AsyncEngine

from app.models.base import Base
from app.main import app
from app.database import get_db

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

# This engine will be created once per test function now.
# This ensures it is created within the event loop managed by pytest-asyncio.
@pytest.fixture(scope="function")
async def test_engine() -> AsyncGenerator[AsyncEngine, None]:
    """Create a new async engine and tables for each test function."""
    engine = create_async_engine(TEST_DATABASE_URL)
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    yield engine
    
    # Drop all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        
    await engine.dispose()


@pytest.fixture(scope="function")
async def db_session(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """
    Provides a clean, transactional database session for each test function.
    This pattern is robust and avoids event loop / transaction conflicts.
    """
    # Connect to the database and begin a transaction.
    async with test_engine.begin() as connection:
        # Create a sessionmaker that uses our test connection
        TestingSessionLocal = async_sessionmaker(
            bind=connection,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
        
        # Create the session for the test
        session = TestingSessionLocal()
        
        # Override the app's dependency to use this same session
        app.dependency_overrides[get_db] = lambda: session

        try:
            yield session
        finally:
            # The 'async with' block automatically rolls back the transaction.
            # We just need to close the session and clear the override.
            await session.close()
            app.dependency_overrides.clear()


@pytest.fixture(scope="function")
async def test_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Creates an async test client. The db_session fixture handles the dependency override.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client