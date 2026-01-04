import asyncio
import sys
import os
import json

# Ensure project root is in path
sys.path.append(os.getcwd())

from app.database import engine, SessionLocal
from app.models.vehicle_definitions import VehicleDefinition
from app.models.base import Base
from sqlalchemy import select

async def seed_vehicles():
    print("Starting seed script...")
    
    # Create tables (sync operation within async context)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async with SessionLocal() as db:
        try:
            # Clear existing data to ensure fresh seed
            await db.execute(select(VehicleDefinition).limit(1)) # Dummy read to ensure connection is valid
            from sqlalchemy import text
            await db.execute(text("DELETE FROM vehicle_definitions"))
            print("Cleared existing vehicle definitions.")
            
            # Load data from JSON file if exists
            json_path = os.path.join(os.path.dirname(__file__), "data", "vehicles.json")
            
            entries = []
            if os.path.exists(json_path):
                print(f"Loading vehicles from {json_path}...")
                with open(json_path, "r") as f:
                    data = json.load(f)
                    # Handle flat list structure from arthurkao/vehicle-make-model-data
                    # Format: [{"year": 2001, "make": "ACURA", "model": "CL"}, ...]
                    for item in data:
                        entries.append(VehicleDefinition(
                            make=item["make"],
                            model=item["model"],
                            year=item["year"]
                        ))
            else:
                print("JSON file not found. Using sample data.")
                # Sample data
                sample_data = [
                    {"make": "Toyota", "model": "Camry", "years": range(2000, 2025)},
                    {"make": "Toyota", "model": "Corolla", "years": range(2000, 2025)},
                    {"make": "Toyota", "model": "RAV4", "years": range(2005, 2025)},
                    {"make": "Honda", "model": "Civic", "years": range(2000, 2025)},
                    {"make": "Honda", "model": "Accord", "years": range(2000, 2025)},
                    {"make": "Honda", "model": "CR-V", "years": range(2005, 2025)},
                    {"make": "Ford", "model": "F-150", "years": range(2000, 2025)},
                    {"make": "Ford", "model": "Mustang", "years": range(2000, 2025)},
                    {"make": "Ford", "model": "Explorer", "years": range(2000, 2025)},
                    {"make": "Chevrolet", "model": "Silverado", "years": range(2000, 2025)},
                    {"make": "Chevrolet", "model": "Malibu", "years": range(2000, 2025)},
                    {"make": "Tesla", "model": "Model 3", "years": range(2017, 2025)},
                    {"make": "Tesla", "model": "Model Y", "years": range(2020, 2025)},
                    {"make": "BMW", "model": "3 Series", "years": range(2000, 2025)},
                    {"make": "BMW", "model": "5 Series", "years": range(2000, 2025)},
                ]

                for item in sample_data:
                    for year in item["years"]:
                        entries.append(VehicleDefinition(
                            make=item["make"],
                            model=item["model"],
                            year=year
                        ))

            # Batch insert (add_all handles large lists well enough for SQLite, 
            # but for massive datasets, chunking might be needed. 
            # The gitub dataset is ~20k rows, which is fine for one transaction)
            if entries:
                db.add_all(entries)
                await db.commit()
                print(f"Successfully seeded {len(entries)} vehicle definitions.")
            else:
                print("No entries to seed.")

        except Exception as e:
            print(f"Error seeding vehicles: {e}")
            await db.rollback()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(seed_vehicles())
