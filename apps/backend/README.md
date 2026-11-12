# CarBaddie Backend 🔧

The backend API service for CarBaddie, a comprehensive vehicle maintenance tracking application. Built with FastAPI and SQLAlchemy, this service provides a robust RESTful API for managing vehicles, maintenance logs, and service schedules.

![Python](https://img.shields.io/badge/Python-3.11+-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-Latest-green)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-red)

## ✨ Features

### RESTful API

- **Vehicle Management**: CRUD operations for vehicles with full metadata support
- **Service Types**: Customizable service type definitions with interval tracking
- **Maintenance Logs**: Comprehensive logging with parts, costs, and notes
- **Vehicle Definitions**: Pre-populated database of vehicle makes/models
- **Backup & Restore**: Full database export and import functionality

### Database

- **Async SQLite**: Non-blocking database operations with aiosqlite
- **Automatic Migrations**: Schema versioning and upgrades with Alembic
- **Data Seeding**: Pre-populated vehicle make/model data
- **Relationship Management**: Proper foreign key constraints and cascading deletes

### API Endpoints

#### Vehicles (`/api/vehicles/`)

- `GET /` - List all vehicles
- `POST /` - Create a new vehicle
- `GET /{vehicle_id}` - Get vehicle details
- `PUT /{vehicle_id}` - Update vehicle
- `DELETE /{vehicle_id}` - Delete vehicle
- `PUT /{vehicle_id}/image` - Upload vehicle image

#### Service Types (`/api/service-types/`)

- `GET /` - List all service types
- `POST /` - Create service type
- `GET /{service_type_id}` - Get service type details
- `PUT /{service_type_id}` - Update service type
- `DELETE /{service_type_id}` - Delete service type

#### Maintenance Logs (`/api/maintenance-logs/`)

- `GET /vehicle/{vehicle_id}` - Get logs for a vehicle
- `POST /` - Create maintenance log
- `GET /{log_id}` - Get log details
- `PUT /{log_id}` - Update log
- `DELETE /{log_id}` - Delete log
- `GET /service-type/{service_type_id}/history` - Get service history

#### Vehicle Definitions (`/api/vehicle-definitions/`)

- `GET /makes` - List all vehicle makes
- `GET /makes/{make}/models` - List models for a make

#### Backup (`/api/backup/`)

- `GET /export` - Export database as JSON
- `POST /import` - Import database from JSON

## 🛠️ Tech Stack

- **Framework**: FastAPI (async web framework)
- **Database**: SQLite with async support (aiosqlite)
- **ORM**: SQLAlchemy 2.0 (async)
- **Migrations**: Alembic
- **Validation**: Pydantic v2
- **CORS**: FastAPI CORS middleware
- **Server**: Uvicorn (ASGI server)
- **Packaging**: PyInstaller (for standalone executable)

## 📋 Prerequisites

- **Python** 3.11 or higher
- **pip** (Python package installer)
- **Virtual environment** support (venv)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/CarBaddie_backend_SAA.git
cd CarBaddie_backend_SAA
```

### 2. Create Virtual Environment

```bash
# Windows
python -m venv .venv
.venv\Scripts\activate

# macOS/Linux
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment

Create a `.env` file in the root directory:

```env
DATABASE_URL=sqlite+aiosqlite:///./car_baddie.db
```

### 5. Initialize Database

The database will be automatically initialized and migrated on first run:

```bash
python run_server.py
```

To manually seed vehicle data:

```bash
python -m app.seed_vehicles
```

## 🏃 Running the Server

### Development Mode

```bash
# Activate virtual environment first
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # macOS/Linux

# Run the server
python run_server.py
```

The API will be available at `http://localhost:8000`

### API Documentation

Once running, access interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Custom Database Path

```bash
python run_server.py --database-path /path/to/custom.db
```

## 🏗️ Building Standalone Executable

The backend can be packaged as a standalone executable for distribution with the Tauri frontend.

### Windows

```bash
# Ensure virtual environment is activated
.venv\Scripts\activate

# Build the executable
pyinstaller carbaddie-backend-x86_64-pc-windows-msvc.spec

# Output will be in dist/carbaddie-backend-x86_64-pc-windows-msvc.exe
```

### macOS (Apple Silicon)

```bash
# Ensure virtual environment is activated
source .venv/bin/activate

# Build the executable
pyinstaller carbaddie-backend.spec

# Output will be in dist/carbaddie-backend
# Rename for Tauri
mv dist/carbaddie-backend dist/carbaddie-backend-aarch64-apple-darwin
```

### macOS (Intel)

```bash
# Build and rename
pyinstaller carbaddie-backend.spec
mv dist/carbaddie-backend dist/carbaddie-backend-x86_64-apple-darwin
```

### Linux

```bash
# Ensure virtual environment is activated
source .venv/bin/activate

# Build the executable
pyinstaller carbaddie-backend.spec

# Output will be in dist/carbaddie-backend
# Rename for Tauri
mv dist/carbaddie-backend dist/carbaddie-backend-x86_64-unknown-linux-gnu
```

## 📁 Project Structure

```
CarBaddie_backend_SAA/
├── app/
│   ├── api/                    # API route handlers
│   │   ├── vehicles.py         # Vehicle endpoints
│   │   ├── service_types.py    # Service type endpoints
│   │   ├── maintenance_logs.py # Maintenance log endpoints
│   │   ├── backup.py           # Backup/restore endpoints
│   │   └── vehicle_definitions.py
│   ├── crud/                   # Database CRUD operations
│   │   ├── vehicles.py
│   │   ├── service_types.py
│   │   ├── maintenance_logs.py
│   │   └── ...
│   ├── models/                 # SQLAlchemy models
│   │   ├── vehicle.py
│   │   ├── service_type.py
│   │   ├── maintenance_log.py
│   │   └── ...
│   ├── data/                   # Static data files
│   │   └── vehicle_data.json   # Vehicle make/model database
│   ├── auth/                   # Authentication (future)
│   ├── database.py             # Database configuration
│   ├── schemas.py              # Pydantic models
│   ├── main.py                 # FastAPI application
│   ├── migrations.py           # Migration runner
│   ├── init_db.py              # Database initialization
│   └── seed_vehicles.py        # Vehicle data seeding
├── alembic/                    # Database migrations
│   ├── versions/               # Migration scripts
│   └── env.py                  # Alembic configuration
├── tests/                      # Test suite
├── build/                      # PyInstaller build artifacts
├── dist/                       # Built executables
├── run_server.py               # Server entry point
├── requirements.txt            # Python dependencies
├── alembic.ini                 # Alembic config
├── pytest.ini                  # Pytest config
├── carbaddie-backend.spec      # PyInstaller spec (Unix)
├── carbaddie-backend-x86_64-pc-windows-msvc.spec  # PyInstaller spec (Windows)
└── README.md                   # This file
```

## 🗄️ Database Schema

### Core Tables

**vehicles**

- Basic vehicle information (make, model, year, VIN, etc.)
- Current mileage and image
- Custom metadata (JSON)

**service_types**

- Service definitions (Oil Change, Tire Rotation, etc.)
- Mileage and time interval settings
- Cost tracking

**maintenance_logs**

- Service records
- Date, mileage, costs, parts, labor
- Associated service type and vehicle
- Notes and documentation

**vehicle_makes**

- Standardized vehicle manufacturers

**vehicle_models**

- Vehicle models linked to makes

## 🔧 Database Migrations

### Create New Migration

```bash
alembic revision --autogenerate -m "Description of changes"
```

### Apply Migrations

Migrations are automatically applied on server startup. To manually run:

```bash
alembic upgrade head
```

### Rollback Migration

```bash
alembic downgrade -1  # Rollback one version
```

## 🧪 Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app

# Run specific test file
pytest tests/test_vehicles.py
```

## 🐛 Troubleshooting

### Database Locked Error

- Ensure only one instance of the server is running
- Close any database browser tools
- Restart the server

### Migration Errors

- Check `alembic/versions/` for conflicting migrations
- Verify database schema matches current codebase
- Try `alembic stamp head` to mark current schema

### PyInstaller Build Issues

- Ensure all hidden imports are in the `.spec` file
- Check that `aiosqlite` is explicitly imported
- Verify the correct Python version (3.11+)
- Clear `build/` and `dist/` directories before rebuilding

### Import Errors

- Activate virtual environment
- Reinstall dependencies: `pip install -r requirements.txt`
- Check Python version compatibility

## 🔒 Security Considerations

- Database file permissions should be restricted
- CORS is configured for local development
- For production deployment, configure appropriate CORS origins
- Consider adding authentication middleware (basic auth module exists but is disabled)

## 📝 API Response Format

### Success Response

```json
{
  "id": 1,
  "make": "Toyota",
  "model": "Camry",
  "year": 2020,
  ...
}
```

### Error Response

```json
{
  "detail": "Error message description"
}
```

## 🚀 Deployment Notes

When deploying with the Tauri frontend:

1. Build the backend executable for the target platform
2. Place it in the frontend's `src-tauri/` directory with the correct name
3. Configure `tauri.conf.json` to include it as an `externalBin`
4. The frontend will automatically spawn the backend on startup

## 📧 Support

For issues or questions, please open an issue on GitHub.

## 🙏 Acknowledgments

- Vehicle data from [arthurkao/vehicle-make-model-data](https://github.com/arthurkao/vehicle-make-model-data)
- Built with [FastAPI](https://fastapi.tiangolo.com/)
- Database migrations with [Alembic](https://alembic.sqlalchemy.org/)
