# CarBaddie — project context

Personal vehicle-maintenance tracker: one user, offline-first, desktop + phone, data in the
user's own Google Drive. Core value is the "what's due and when" engine.

## Layout (pnpm 12 monorepo, Node 22.18+ / 24 LTS, Windows dev machine)

```
apps/desktop   Tauri 2 (Rust) + React 19 + Vite + shadcn + React Query. SQLite via 4 rusqlite
               commands in src-tauri/src/db.rs (one connection; queries live in core)
apps/mobile    Expo SDK 58 + expo-router + expo-sqlite
packages/core  @carbaddie/core: types, repository (all SQL), migrations, due-date engine,
               backup format, validation; consumed as TS source (no build)
```

Commands from the repo root: `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm desktop`, `pnpm mobile`.
CI (.github/workflows/ci.yml): frozen install, typecheck, core tests.

## Conventions

- Data types live only in `packages/core/src/types.ts` (UUID ids); each app's `src/types.ts` re-exports them.
- All data access goes through `createRepository` (`packages/core/src/db/repository.ts`) over a `SqlDriver`;
  apps only adapt their SQLite (`apps/mobile/src/db/schema.ts`, `apps/desktop/src/db.ts`) and call
  `openRepository()`. Repository methods own their transaction (`db/transaction.ts`, queued, not nestable):
  internal helpers never start one. User edits are validated in core (`validation.ts`, `ValidationError`).
- Schema changes go in `packages/core/src/db/migrations.ts` as a new version (`PRAGMA user_version`); never
  edit a shipped migration. Every synced row: UUID `id`, `updated_at` (HLC string), `deleted_at` tombstone,
  `device_id`. Reads filter `deleted_at IS NULL`; deletes tombstone and cascade by hand (core repository.ts).
- Backup/Drive JSON keeps file-local integer ids (`packages/core/src/backup/format.ts`, zod), compatible with
  files from older app versions; importers always create fresh local ids.
- Core source files must not have runtime imports between each other unless they use a `.ts`
  extension (type-only imports are fine). Tests run with plain `node --test` + type stripping.
- Core tests: `packages/core/test/*.test.ts`, node:test + node:assert, inject a fixed `today`.
- Keep `@tauri-apps/*` JS packages on the same minor as the Rust crates in
  `apps/desktop/src-tauri/Cargo.lock`, or `tauri dev` reports mismatched versions.
- `.npmrc` uses `node-linker=hoisted` (needed by Expo/Metro). Builds allowed via `allowBuilds` in pnpm-workspace.yaml.
- Work branch: `claude/restructure`, pushed to github.com/brahim-radhoin/CarBaddie (default branch; no `main`
  yet). History was rewritten before the first push to drop dev DBs and the sidecar exe.
  Old per-app git dirs are archived in `.old-repos/` (ignored).
- `apps/desktop/GEMINI.md` holds the user's agent rules: plan first, minimal contained changes,
  no speculative edits, summarise every file changed.

## Roadmap (agreed target architecture)

Goal: one TS domain core, SQLite on every device, real sync. No separate backend
(decided against a Rust backend: it would duplicate the domain with the Expo app; Rust stays a thin
native layer — SQLite via rusqlite, OAuth loopback, keychain, notifications. Not tauri-plugin-sql:
its connection pool can't keep BEGIN/COMMIT on one connection).

1. DONE — snapshot, CI, crash fixes (restore form field `backup_file`, mobile QueryClient
   order, SQLite `PRAGMA foreign_keys=ON`, VIN-less duplicate skipping, mobile import in one transaction).
2. DONE — monorepo + `@carbaddie/core` (types, `computeUpcomingMaintenance`, `vehicleIdentityKey`, 14 tests).
3. DONE (mobile + core) — sync-ready data model: migration v2 (UUIDv7 ids, HLC `updated_at`,
   tombstones, `device_id`, built-in slugs + UUIDv5, archivable custom fields), versioned migrations,
   zod backup schema. Tested on copies of a fixture DB and the committed desktop DBs. The desktop
   backend was deliberately left on integer ids: step 4 runs the same core migration on its DB.
4. DONE — Python sidecar removed (apps/backend deleted). Desktop and mobile share the core repository;
   desktop migrates its existing DB in place (copy saved first as `car_baddie.before-v<N>-<ts>.db`);
   migration v3 drops `vehicle_definitions`/`alembic_version`; catalog is `apps/desktop/src/data/
   vehicle-catalog.json`, loaded lazily; no DB is bundled. Verified on a copy of the real desktop DB.
5. NEXT — Sync engine: each device appends its own change files to Drive `appDataFolder`
   (`drive.appdata` scope), merges others' changes by last-writer-wins on the HLC, compacts into
   snapshots. JSON/CSV export stays as a separate backup feature. OAuth: separate client per
   platform, PKCE + `state`, tokens in OS keychain (not localStorage).
6. Domain upgrades: garage visits with multiple service items (`service_events` + items),
   first-class `odometer_readings`, money as integer cents + currency, km canonical with display
   units, local notifications from the engine.

## Known open issues

- Step 5 must handle two devices creating the same VIN (partial unique index on live VINs) and name
  collisions of custom service types; built-ins and interval overrides already share ids across devices.
- Desktop's service types came from the old backend seed; on the user's real DB 6 of 17 matched a core
  built-in name and got its slug/UUID. Mobile seeds 25. Nothing reconciles the two lists yet.
- Drive sync is still snapshot-restore: VIN matches are replaced by the incoming copy (remote wins),
  mobile pushes its whole DB on every foreground. Replaced by step 5.
- Desktop dashboard counts "overdue" as >365 days since last log instead of using
  `computeUpcomingMaintenance` (the shared hook exists in apps/desktop/src/hooks but is unused).
- Desktop "auto sync" toggle does nothing. Mobile Google sign-in uses implicit flow, no refresh token.
- Tauri capability allows writing text files anywhere (`"**"`).
