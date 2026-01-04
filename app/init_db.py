import sys
import os
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from dotenv import load_dotenv

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.models.base import Base, ServiceType

# --- Configuration ---
load_dotenv()
SQLITE_URL = os.getenv("DATABASE_URL")
if SQLITE_URL and SQLITE_URL.startswith("sqlite"):
    SQLITE_URL = "sqlite+aiosqlite:///" + SQLITE_URL.split(":///")[1]

POSTGRES_URL = "postgresql+asyncpg://postgres:postgres@localhost/car_baddie_db"

# --- Main Migration Logic ---
async def migrate_service_types(sqlite_session: AsyncSession):
    """
    Fetches service types from PostgreSQL and inserts them into SQLite.
    """
    print(">> Connecting to PostgreSQL to migrate service types...")
    postgres_engine = create_async_engine(POSTGRES_URL, echo=False)
    
    async with postgres_engine.connect() as pg_conn:
        result = await pg_conn.execute(text("SELECT id, name, recommended_interval_km, recommended_interval_days FROM service_types ORDER BY id"))
        service_types_data = result.fetchall()

    if not service_types_data:
        print(">> No service types found in PostgreSQL database.")
        await postgres_engine.dispose()
        return

    print(f">> Found {len(service_types_data)} service types to migrate.")

    for row in service_types_data:
        # Check if service type with the same name already exists
        existing_service_type = await sqlite_session.execute(
            text("SELECT id FROM service_types WHERE name = :name"),
            {"name": row.name}
        )
        if existing_service_type.scalar_one_or_none() is None:
            new_service_type = ServiceType(
                name=row.name,
                recommended_interval_km=row.recommended_interval_km,
                recommended_interval_days=row.recommended_interval_days
            )
            sqlite_session.add(new_service_type)
    
    await sqlite_session.commit()
    print(">> Service types migration complete.")
    await postgres_engine.dispose()


async def reset_database():
    """
    Resets the SQLite database, recreates tables, and migrates data.
    """
    if not SQLITE_URL:
        print("Error: DATABASE_URL is not set in .env file.")
        return

    sqlite_engine = create_async_engine(SQLITE_URL, echo=True)

    async with sqlite_engine.begin() as conn:
        print(">> Dropping all tables...")
        await conn.run_sync(Base.metadata.drop_all)
        print(">> Recreating tables...")
        await conn.run_sync(Base.metadata.create_all)

    # Create a session for the migration
    AsyncSessionFactory = sessionmaker(sqlite_engine, expire_on_commit=False, class_=AsyncSession)
    async with AsyncSessionFactory() as session:
        await migrate_service_types(session)

    await sqlite_engine.dispose()
    print(">> Database reset and migration complete.")

if __name__ == "__main__":
    # Ensure you have asyncpg installed: pip install asyncpg
    asyncio.run(reset_database())