      
import json

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.crud.backup import get_configured_backup_data, analyze_backup_file, execute_import
from app.schemas import BackupConfiguration, FullBackupData, BackupAnalysisResponse, RestorePlan
from app.database import get_db

router = APIRouter(
    prefix="/backup",
    tags=["Backup & Restore"]
)

# This is a complex payload for the import execution, so it needs a dedicated model.
class ImportExecutionPayload(BaseModel):
    plan: RestorePlan
    backup_data: FullBackupData

@router.post("/export", response_model=FullBackupData)
async def export_configurable_backup_route(
    config: BackupConfiguration,
    db: AsyncSession = Depends(get_db)
):
    """
    Generates and returns a backup of application data based on configuration.
    This is a read-only operation.
    """
    return await get_configured_backup_data(db, config)

@router.post("/analyze", response_model=BackupAnalysisResponse)
async def analyze_backup_route(
    backup_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Receives and analyzes a backup file against the current database to find conflicts.
    This is a read-only operation.
    """
    try:
        contents = await backup_file.read()
        data = json.loads(contents)
        backup_data = FullBackupData.model_validate(data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid or corrupted backup file: {e}"
        )

    return await analyze_backup_file(db, backup_data)

@router.post("/execute_import", status_code=status.HTTP_204_NO_CONTENT)
async def execute_restore_from_backup_route(
    payload: ImportExecutionPayload,
    db: AsyncSession = Depends(get_db)
):
    """
    DANGEROUS: Executes a restore plan, performing all database operations
    within a single, atomic transaction.
    """
    try:
        # The CRUD function stages all changes (deletes, inserts).
        await execute_import(db, payload.backup_data, payload.plan)
        # The commit happens here, at the end of the request, if all stages were successful.
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Database integrity error during import: {e.orig}"
        )
    except Exception as e:
        await db.rollback()
        # It's good practice to log the actual error for debugging
        print(f"ERROR during import execution: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during the import process."
        )

    # A 204 No Content response is returned on success.
    return

@router.delete("/wipe_database", status_code=status.HTTP_204_NO_CONTENT)
async def wipe_database_route(db: AsyncSession = Depends(get_db)):
    """Permanently deletes all vehicles, maintenance logs, and interval overrides."""
    from app.models.base import MaintenanceLog, VehicleServiceIntervalOverride, Vehicle
    await db.execute(delete(MaintenanceLog))
    await db.execute(delete(VehicleServiceIntervalOverride))
    await db.execute(delete(Vehicle))
    await db.commit()
