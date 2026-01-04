"""Runtime database migrations using Alembic."""
import os
import sys
from pathlib import Path


def get_backend_root() -> Path:
    """Get the backend root directory, handling PyInstaller bundling.
    
    When running as a PyInstaller executable, files are extracted to a 
    temporary directory accessed via sys._MEIPASS.
    """
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        # Running as PyInstaller bundle
        return Path(sys._MEIPASS)
    else:
        # Running as normal Python script
        return Path(__file__).parent.parent


def run_migrations(database_path: str | None = None):
    """Run all pending Alembic migrations.
    
    Args:
        database_path: Optional path to SQLite database. If provided,
                      sets the DATABASE_URL environment variable before
                      importing the app.database module.
    """
    # Set DATABASE_URL if path provided (for sidecar mode)
    # This must be done BEFORE importing app.database
    if database_path:
        os.environ["DATABASE_URL"] = f"sqlite:///{database_path}"
    
    backend_root = get_backend_root()
    alembic_ini = backend_root / "alembic.ini"
    alembic_dir = backend_root / "alembic"
    
    # Check if Alembic files exist (they must be bundled with PyInstaller)
    if not alembic_ini.exists():
        print(f"[Migrations] WARNING: alembic.ini not found at {alembic_ini}")
        print("[Migrations] Skipping migrations - ensure alembic files are bundled with PyInstaller")
        return
    
    if not alembic_dir.exists():
        print(f"[Migrations] WARNING: alembic directory not found at {alembic_dir}")
        print("[Migrations] Skipping migrations - ensure alembic directory is bundled with PyInstaller")
        return
    
    # Import Alembic only when needed (avoid import errors if not bundled)
    from alembic.config import Config
    from alembic import command
    
    alembic_cfg = Config(str(alembic_ini))
    
    # Set the script location explicitly (important for PyInstaller)
    alembic_cfg.set_main_option("script_location", str(alembic_dir))
    
    print(f"[Migrations] Running migrations for database: {database_path or 'default'}")
    print(f"[Migrations] Alembic config: {alembic_ini}")
    
    # Run migrations to head
    command.upgrade(alembic_cfg, "head")
    
    print("[Migrations] All migrations applied successfully.")
