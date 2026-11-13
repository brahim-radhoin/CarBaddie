/**
 * Identity used for vehicles that have no VIN: case-insensitive make and model plus year.
 *
 * Backup imports use it to recognise a VIN-less vehicle that already exists locally, so
 * restoring or syncing the same backup twice doesn't add the vehicle again.
 */
export function vehicleIdentityKey(
  make?: string | null,
  model?: string | null,
  year?: number | null,
): string {
  return `${(make ?? "").trim().toLowerCase()}|${(model ?? "").trim().toLowerCase()}|${year ?? ""}`;
}
