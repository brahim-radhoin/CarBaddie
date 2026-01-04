import os
import argparse
import sys
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
SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with SessionLocal() as session:
        yield session
