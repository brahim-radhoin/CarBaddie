# CarBaddie — project context

Personal vehicle-maintenance tracker: one user, offline-first, desktop + phone, data in the
user's own Google Drive. Core value is the "what's due and when" engine.

## Layout (pnpm 12 monorepo, Node 22.18+ / 24 LTS, Windows dev machine)

```
apps/desktop   Tauri 2 (Rust) + React 19 + Vite + shadcn + React Query
apps/mobile    Expo SDK 58 + expo-router + expo-sqlite (standalone, no backend)
apps/backend   FastAPI + SQLAlchemy + Alembic, built with PyInstaller into
               carbaddie-backend-*.exe and run by the desktop as a sidecar on 127.0.0.1:8000
packages/core  @carbaddie/core: shared types + domain logic, consumed as TS source (no build)
```

Commands from the repo root: `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm desktop`, `pnpm mobile`.
CI (.github/workflows/ci.yml): frozen install, typecheck, core tests.

## Conventions

- Data types live only in `packages/core/src/types.ts` (UUID ids); each app's `src/types.ts` re-exports them.
  Exception until step 4: desktop re-exports `@carbaddie/core/legacy` (integer ids, mirrors the Python backend).
- Schema changes go in `packages/core/src/db/migrations.ts` as a new version (`PRAGMA user_version`); never
  edit a shipped migration. Every synced row: UUID `id`, `updated_at` (HLC string), `deleted_at` tombstone,
  `device_id`. Reads filter `deleted_at IS NULL`; deletes tombstone and cascade by hand (mobile repository.ts).
- Backup/Drive JSON keeps file-local integer ids (`packages/core/src/backup/format.ts`, zod) so the desktop
  backend can still restore mobile backups; importers always create fresh local ids.
- Core source files must not have runtime imports between each other unless they use a `.ts`
  extension (type-only imports are fine). Tests run with plain `node --test` + type stripping.
- Core tests: `packages/core/test/*.test.ts`, node:test + node:assert, inject a fixed `today`.
- Keep `@tauri-apps/*` JS packages on the same minor as the Rust crates in
  `apps/desktop/src-tauri/Cargo.lock`, or `tauri dev` reports mismatched versions.
- `.npmrc` uses `node-linker=hoisted` (needed by Expo/Metro). Builds allowed via `allowBuilds` in pnpm-workspace.yaml.
- Work branch: `claude/restructure` (not yet pushed; user will create a new GitHub repo).
  Old per-app git dirs are archived in `.old-repos/` (ignored).
- `apps/desktop/GEMINI.md` holds the user's agent rules: plan first, minimal contained changes,
  no speculative edits, summarise every file changed.

## Roadmap (agreed target architecture)

Goal: one TS domain core, SQLite on every device, real sync. No separate backend
(decided against a Rust backend: it would duplicate the domain with the Expo app; Rust stays a thin
native layer — SQLite via tauri-plugin-sql, OAuth loopback, keychain, notifications).

1. DONE — snapshot, CI, crash fixes (restore form field `backup_file`, mobile QueryClient
   order, SQLite `PRAGMA foreign_keys=ON`, VIN-less duplicate skipping, mobile import in one transaction).
2. DONE — monorepo + `@carbaddie/core` (types, `computeUpcomingMaintenance`, `vehicleIdentityKey`, 14 tests).
3. DONE (mobile + core) — sync-ready data model: migration v2 (UUIDv7 ids, HLC `updated_at`,
   tombstones, `device_id`, built-in slugs + UUIDv5, archivable custom fields), versioned migrations,
   zod backup schema. Tested on copies of a fixture DB and the committed desktop DBs. The desktop
   backend was deliberately left on integer ids: step 4 runs the same core migration on its DB.
4. NEXT — Replace the Python sidecar: desktop talks to SQLite directly through a core repository layer
   (port apps/mobile/src/db/repository.ts; run `migrate()` from core on the existing desktop DB, then delete
   `packages/core/src/legacy/`). Removes PyInstaller, port 8000, PID handling.
   Vehicle catalog (19.7k rows) becomes a read-only asset, not part of the user DB; stop shipping
   the dev DB (it contains test vehicles) — create the DB via migrations on first run.
5. Sync engine: each device appends its own change files to Drive `appDataFolder`
   (`drive.appdata` scope), merges others' changes by last-writer-wins on the HLC, compacts into
   snapshots. JSON/CSV export stays as a separate backup feature. OAuth: separate client per
   platform, PKCE + `state`, tokens in OS keychain (not localStorage).
6. Domain upgrades: garage visits with multiple service items (`service_events` + items),
   first-class `odometer_readings`, money as integer cents + currency, km canonical with display
   units, local notifications from the engine.

## Known open issues

- Step 5 must handle two devices creating the same VIN (partial unique index on live VINs) and name
  collisions of custom service types; built-ins and interval overrides already share ids across devices.

- Drive sync is still snapshot-restore: VIN matches are replaced by the incoming copy (remote wins),
  mobile pushes its whole DB on every foreground. Replaced by step 5.
- Desktop dashboard counts "overdue" as >365 days since last log instead of using
  `computeUpcomingMaintenance` (the shared hook exists in apps/desktop/src/hooks but is unused).
- Desktop "auto sync" toggle does nothing. Mobile Google sign-in uses implicit flow, no refresh token.
- Backend: `vehicle_definitions` table not created by Alembic; restore doesn't import
  resets/suggestions; `app/routes.py` and `app/__Old__crud.py` are dead code; README endpoints wrong.
- Tauri capability allows writing text files anywhere (`"**"`).
