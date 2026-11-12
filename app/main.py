from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

# Import the router modules
from app.api import vehicles, service_types, maintenance_logs, backup, vehicle_definitions
# from app.auth.basic_auth import verify_credentials

from app.seed_service_types import seed_service_types

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run startup scripts
    await seed_service_types()
    yield

# 1. Create the FastAPI app instance
app = FastAPI(
    title="CarBaddie API",
    description="A precision-engineered vehicle maintenance log system.",
    version="1.0.0",
    lifespan=lifespan
)

origins = [    
    "http://localhost:5173",
    "http://tauri.localhost",
    "http://localhost.tauri.localhost",
]

# 2. Add the CORSMiddleware. This should come BEFORE the routers are included.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods including PUT, DELETE, etc.
    allow_headers=["*"],  # Allows all headers
)

# 3. Include the routers. Now they are wrapped by the middleware.
app.include_router(vehicles.router)
app.include_router(service_types.router)
app.include_router(maintenance_logs.router)
app.include_router(backup.router)
app.include_router(vehicle_definitions.router)

# --- Root and other miscellaneous routes can be defined last ---
@app.get("/", tags=["Root"])
def read_root():
    """A simple endpoint to confirm the API is live."""
    return {"message": "CarBaddie Backend is live!"}
