import asyncio
import sys
import os

# Ensure project root is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import engine, SessionLocal
from app.models.base import ServiceType, service_type_resets, service_type_suggestions
from sqlalchemy import select

# Define a comprehensive set of maintenance items
# Some are generic, some are specific.
# Note: Intervals are estimates for standard modern cars.
SERVICE_DATA = [
    # --- CORE ENGINE & OIL ---
    {"name": "Oil Change", "km": 8000, "days": 180},
    {"name": "Oil Filter Replacement", "km": 8000, "days": 180},
    {"name": "Engine Air Filter Replacement", "km": 30000, "days": 365},
    {"name": "Spark Plugs Replacement", "km": 96000, "days": None},
    {"name": "Coolant Flush", "km": 96000, "days": 1095},
    {"name": "Timing Belt Replacement", "km": 160000, "days": 2555},
    {"name": "Serpentine Belt Replacement", "km": 96000, "days": 1825},

    # --- BRAKES & TIRES ---
    {"name": "Tire Rotation", "km": 8000, "days": 180},
    {"name": "Tire Replacement", "km": 80000, "days": 2190},
    {"name": "Wheel Alignment", "km": 24000, "days": 365},
    {"name": "Brake Pad Replacement (Front)", "km": 64000, "days": None},
    {"name": "Brake Pad Replacement (Rear)", "km": 80000, "days": None},
    {"name": "Brake Rotor Resurfacing / Replacement", "km": 112000, "days": None},
    {"name": "Brake Fluid Flush", "km": 48000, "days": 730},

    # --- FLUIDS & FILTERS ---
    {"name": "Transmission Fluid Change", "km": 96000, "days": 1095},
    {"name": "Power Steering Fluid Change", "km": 80000, "days": 1095},
    {"name": "Differential Fluid Change", "km": 80000, "days": 1095},
    {"name": "Cabin Air Filter Replacement", "km": 24000, "days": 365},
    {"name": "Fuel Filter Replacement", "km": 64000, "days": None},

    # --- OTHER COMPONENTS ---
    {"name": "Wiper Blade Replacement", "km": None, "days": 365},
    {"name": "Battery Replacement", "km": None, "days": 1460},
    {"name": "Headlight Bulb Replacement", "km": None, "days": None},

    # --- SCHEDULED MILESTONE SERVICES ---
    {"name": "Major Service (30k / 60k / 90k Mile)", "km": 48000, "days": 1095},
    {"name": "Minor Service", "km": 8000, "days": 180},
    {"name": "Multi-Point Inspection", "km": 8000, "days": 180},
]

# Define how service types connect to each other by name
# If you perform "Service A", it might automatically reset the timer for "Service B"
RESETS_MAP = {
    "Oil Change": ["Oil Filter Replacement"],
    "Tire Replacement": ["Tire Rotation", "Wheel Alignment"],
    "Major Service (30k / 60k / 90k Mile)": [
        "Oil Change", 
        "Oil Filter Replacement", 
        "Tire Rotation", 
        "Engine Air Filter Replacement", 
        "Cabin Air Filter Replacement",
        "Minor Service",
        "Multi-Point Inspection"
    ],
    "Minor Service": [
        "Oil Change",
        "Oil Filter Replacement",
        "Tire Rotation",
        "Multi-Point Inspection"
    ],
    "Brake Rotor Resurfacing / Replacement": ["Brake Pad Replacement (Front)", "Brake Pad Replacement (Rear)"]
}

# Define suggestions. If you perform "Service A", the UI will suggest logging "Service B" alongside it.
SUGGESTIONS_MAP = {
    "Oil Change": ["Tire Rotation", "Engine Air Filter Replacement", "Multi-Point Inspection"],
    "Tire Rotation": ["Brake Pad Replacement (Front)", "Brake Pad Replacement (Rear)", "Wheel Alignment"],
    "Tire Replacement": ["Wheel Alignment"],
    "Brake Pad Replacement (Front)": ["Brake Rotor Resurfacing / Replacement", "Brake Fluid Flush"],
    "Brake Pad Replacement (Rear)": ["Brake Rotor Resurfacing / Replacement", "Brake Fluid Flush"],
    "Engine Air Filter Replacement": ["Cabin Air Filter Replacement"],
    "Cabin Air Filter Replacement": ["Wiper Blade Replacement"],
}

async def seed_service_types():
    print("Checking if pre-installed Service Types need to be seeded...")
    
    async with SessionLocal() as db:
        try:
            # Check if any service types exist
            result = await db.execute(select(ServiceType).limit(1))
            if result.scalar_one_or_none() is not None:
                print("Service Types already exist. Skipping seed.")
                return

            print("Database is empty. Inserting default Service Types...")
            
            # Step 1: Insert all service types
            name_to_id = {}
            for data in SERVICE_DATA:
                st = ServiceType(
                    name=data["name"],
                    recommended_interval_km=data["km"],
                    recommended_interval_days=data["days"]
                )
                db.add(st)
                await db.flush() # Flush to get the ID
                name_to_id[data["name"]] = st.id
            
            # Step 2: Build the interconnections (Resets & Suggestions)
            for parent_name, reset_names in RESETS_MAP.items():
                if parent_name not in name_to_id: continue
                parent_id = name_to_id[parent_name]
                for child_name in reset_names:
                    if child_name not in name_to_id: continue
                    child_id = name_to_id[child_name]
                    await db.execute(
                        service_type_resets.insert().values(parent_id=parent_id, reset_id=child_id)
                    )

            for parent_name, suggestion_names in SUGGESTIONS_MAP.items():
                if parent_name not in name_to_id: continue
                parent_id = name_to_id[parent_name]
                for child_name in suggestion_names:
                    if child_name not in name_to_id: continue
                    child_id = name_to_id[child_name]
                    await db.execute(
                        service_type_suggestions.insert().values(parent_id=parent_id, suggestion_id=child_id)
                    )
            
            # Step 3: Commit all changes
            await db.commit()
            print(f"Successfully seeded {len(SERVICE_DATA)} pre-installed Service Types with interconnections.")

        except Exception as e:
            print(f"Error seeding service types: {e}")
            await db.rollback()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(seed_service_types())
