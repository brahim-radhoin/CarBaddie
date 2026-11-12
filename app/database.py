import os
import argparse
import sys
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

def get_database_url():
    # 1. Try command line argument --database-path
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-path", help="Path to the SQLite database file")
    args, unknown = parser.parse_known_args()
    
    if args.database_path:
        return f"sqlite+aiosqlite:///{args.database_path}"

    # 2. Try DATABASE_URL env var
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        if database_url.startswith("sqlite"):
             # Ensure aiosqlite driver
             if "sqlite+aiosqlite" not in database_url:
                 database_url = "sqlite+aiosqlite:///" + database_url.split(":///")[1]
        return database_url
        
    # 3. Fallback for local dev (search one dir up if not specified)
    # Default to current directory if nothing else found
    return "sqlite+aiosqlite:///car_baddie.db"

DATABASE_URL = get_database_url()

engine = create_async_engine(DATABASE_URL, echo=True)

if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine.sync_engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
        # SQLite ignores ON DELETE CASCADE / SET NULL unless this is enabled on every
        # connection. Without it, bulk deletes (restore "replace", wipe) leave orphaned
        # logs, overrides and custom field values behind.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with SessionLocal() as session:
        yield session
