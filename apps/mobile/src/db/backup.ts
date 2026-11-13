// Backup export/analyze/import, implemented in @carbaddie/core. Callers validate raw JSON
// with `parseBackup` from @carbaddie/core before passing it here.
import type { BackupAnalysisResponse, BackupConfiguration, FullBackupData, RestorePlan } from "../types";
import { getRepository } from "./schema";

export async function exportBackupData(config: BackupConfiguration): Promise<FullBackupData> {
  return (await getRepository()).exportBackup(config);
}

export async function analyzeBackup(backupData: FullBackupData): Promise<BackupAnalysisResponse> {
  return (await getRepository()).analyzeBackup(backupData);
}

export async function executeImport(backupData: FullBackupData, plan: RestorePlan): Promise<void> {
  return (await getRepository()).importBackup(backupData, plan);
}
