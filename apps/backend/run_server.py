import uvicorn
import argparse
import aiosqlite  # Force PyInstaller to bundle this

from app.migrations import run_migrations
from app.main import app

if __name__ == "__main__":
    # Parse --database-path argument
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-path", help="Path to SQLite database")
    args, unknown = parser.parse_known_args()

    # Run migrations before starting server
    print("Running database migrations...")
    run_migrations(args.database_path)
    print("Migrations complete. Starting server...")

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
    )