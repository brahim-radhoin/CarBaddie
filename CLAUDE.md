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
  internal helpers never start one. User edits are validated in core (`validation.ts`, `ValidationError`):
  real calendar dates; visit, log, odometer and acquisition dates not after today nor before 1 January of
  model year − 1 (`vehicleStartDate`); a model year 1886..next year that leaves no history older than the
  vehicle; mileage under 2,000,000 km; custom values matching their field type (custom dates may be future);
  text trimmed, control characters stripped, length-capped. Updates check only fields whose value changes
  (forms resend everything), so old records that break a newer rule stay editable. Backup import and sync
  are never validated. Forms prevent first (calendar/input `min`/`max`, `parseWholeNumber`, `useHistoryChecks`).
  An odometer reading out of step with the vehicle's others is a warning under the field (`odometerConflict`,
  `describeOdometerConflict`), never an error: odometers get replaced.
- Schema changes go in `packages/core/src/db/migrations.ts` as a new version (`PRAGMA user_version`); never
  edit a shipped migration. Every synced row: UUID `id`, `updated_at` (HLC string), `deleted_at` tombstone,
  `device_id`. Reads filter `deleted_at IS NULL`; deletes tombstone and cascade by hand (core repository.ts).
- Built-in service types (`packages/core/src/service-types/builtin.ts`) and their default fields have fixed
  UUIDv5 ids (slug, slug/key); never change a shipped slug or field key. `db/seed.ts` runs on every open,
  adds missing ones (deleted ones stay deleted) and stamps them `SEED_STAMP` (older than any real write,
  so a fresh device's seed never overrides an edit or delete synced from elsewhere). `db/legacy.ts` merges
  the old desktop's duplicate types into built-ins once per device (`service_types.legacy_merged`).
- Money and distance (`packages/core/src/units.ts`): costs are integer hundredths (`cost_cents`, `*_cents`),
  distances are km everywhere in storage and the engine. One synced `preferences` table holds `currency`
  (ISO code) and `distance_unit` (km|mi); apps show/parse through `useUnits()` (each app's src/hooks) and
  convert typed distances with `fromDisplay` before saving. Sync upgrades rows from older-schema files
  (`sync/upgrade.ts`); a new column rename needs a case there.
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

## UI contract (desktop and mobile must read the same)

Rule: anything driven by the same data reads the same on both apps (term, number, date, status word and
colour, mode, accent). Layout may differ (sidebar vs tabs, popover vs sheet).

- Colours: one palette, `packages/core/src/theme.ts` (graphite ramp, one accent, three status colours,
  six accent choices with a light and a dark shade). Mobile builds its theme from it (`apps/mobile/src/theme.ts`);
  desktop mirrors it in `apps/desktop/src/index.css` and `test/theme.test.ts` fails when the two differ or a
  text colour drops under 4.5:1. Change a colour in core first, then the CSS.
- Primary is ink on light and off-white on dark; the accent only marks focus, selection, links, the main
  chart series and the active menu item, and the vehicle outline when the user picks "Accent" for it.
  Status colours (`danger`, `warn`, `ok`) carry meaning only.
- Due state: the engine's `message` says when, `STATUS_LABEL` / `summariseStatuses` (core
  `maintenance/status.ts`) say which bucket (Overdue, Due soon, On track). A status dot in the status colour
  is the signature, used wherever something is due.
- Dates: `formatISO` / `todayISO` / `parseISO` / `daysBetweenISO` from core (`dates.ts`). Never
  `toISOString()` or `new Date("YYYY-MM-DD")` for a calendar date (UTC off-by-one).
- Words: "service type" (not category), "visit" (one garage visit) and "log" (one service in it), "odometer",
  "Total spent", "part of the vehicle" (what service types are grouped by; the outline's parts), "Vehicle outline". Sentence case everywhere, no jargon (telemetry, fleet), no exclamation marks, short UI strings
  end without a period. Nav: Vehicles, Service types, Settings. Settings groups: Sync, Preferences, Appearance,
  Data and backup, Danger zone.
- Appearance: mode (system, light, dark), accent and vehicle outline colour (Neutral = text colour, Accent) are
  chosen per device. Desktop keeps them in localStorage (applied before first paint as `data-accent` /
  `data-outline` → `--outline`), mobile in app_settings (`appearance.*`, `APPEARANCE_SETTING_KEYS`). "Loop the
  garage deck" is phone-only (the desktop deck is a grid). Syncing the accent between devices would mean a new
  synced preference (core types, backup schema, sync upgrade).
- Type: weights 400 to 600, nothing under 12px, tabular figures for numbers. Touch targets 48dp on mobile.
- Garage deck (mobile home): favourites are big swipeable cards, the rest sit behind one row above them, Add visit
  is a bar at the bottom for the card in view. `vehicles.body_type` (a string; unknown kinds pass through) picks the
  outline from `packages/core/src/vehicles/silhouettes.ts` (data both apps can render); `is_favorite` NULL means
  unset and resolves identically on every device (`vehicles/garage.ts`). Service types sit in a part of the vehicle
  (`maintenance/zones.ts`): `service_types.zone` (v9, a string, NULL = unset → built-in slug's part, else "other";
  forms send it only when the user picks one), resolved by `serviceTypeZone`; lists and pickers group by it
  (`groupServiceTypes`) and the outline marks it. Outline colour is one token (`outline` in
  `apps/mobile/src/theme.ts`, `--outline` on desktop). With "Loop the garage deck" the deck is repeated
  (`LOOP_ROUNDS`) and opened in the middle; cards scale and fade near the centre (off under reduce motion).
- Geist on both apps, bundled: desktop @fontsource-variable/geist, mobile @expo-google-fonts/geist (400/500/600
  files, `apps/mobile/src/fonts.ts`). Mobile text goes through Themed `Text`/`TextInput`, which turn the weight into
  the family (no `fontWeight` left); navigation uses `font()` / the theme's `fonts`. Why: on the user's Android phone
  semi-bold labels lost their end ("Delet") and centred text sat left, i.e. measured narrower than drawn. Known
  causes it targets: OEM system fonts + weight, a Fabric measure paint left on an icon font (react/react-native
  #57950), dropped variation axes (fixed in RN 0.88.1). Not yet confirmed on the phone.
- Garage order: synced preference `garage_order` (JSON list of vehicle ids; `getGarageOrder`/`setGarageOrder`,
  no migration: older apps keep and pass on the row). `splitGarage(vehicles, order)` only sorts the deck and the
  list; favourites still decide the deck. Arranged on mobile (Arrange garage screen) and desktop (Arrange sheet).
  Not in backups (no preference is).

## Schema and sync compatibility (published app: devices run different versions)

Every migration declares `compat` in `packages/core/src/db/migrations.ts`: "additive" (a nullable column, a new
table; older apps keep syncing) or "breaking" (rename, removal, changed meaning; older apps stop and are told to
update). When unsure: breaking. Rules that make additive changes safe, all covered by `test/sync-compat.test.ts`:

- Sync files carry `schema_version` (the writer) and `min_reader` (the newest breaking migration). A reader older
  than `min_reader` skips that device's files, keeps syncing the rest, still pushes, and reports `blocked`.
- A column the app doesn't know is kept in `sync_extra` and sent back with the row, so a device that is behind
  never strips what one that is ahead wrote; `adoptExtras` (run on open) moves it into the column after an update.
- Copies of one row that carry different columns are combined (newer wins per column it carries), not picked between.
- Writers validate strictly, readers accept anything: enum-like columns are strings, unknown values pass through.
- A new column is NULL until a user sets it and the migration writes no rows; "unset" must resolve the same on
  every device. Updates only touch fields the caller sends.
- `test/fixtures/sync-file-v*.json` are files written by released versions; they must keep applying. Add one when
  you add a migration, and never edit the old ones.
- Never run a build with a newer schema against the real database to "just look": `migrate()` upgrades it in
  place and apps still on the old schema then refuse to open it. Test on a copy.

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
5. DONE — sync engine (`packages/core/src/sync/engine.ts`, `files.ts`, `drive.ts`): each
   device writes only its own files to Drive `appDataFolder` (`carbaddie-chg-<device>-<seq>.json`, compacted
   into `carbaddie-snap-<device>-<seq>.json` after 50), merges others' rows by last-writer-wins on the HLC.
   Same live VIN → merged into the smaller id (`vehicles.merged_into`, migration v4; children moved); same
   service type / active field name → larger id renamed "Name (2)"; children of deleted parents tombstoned.
   Files from a newer schema are refused. Sync state is in app_settings (`sync.*`). Desktop: PKCE + `state`
   loopback sign-in, refresh token in the OS keychain (`src-tauri/src/secrets.rs`, keyring crate),
   `useAutoSync` (start, 5 min, focus, after edits); set `VITE_GOOGLE_CLIENT_SECRET` if the Desktop OAuth
   client demands its (non-confidential) secret. Verified on a copy of the real desktop DB vs a fresh device.
   Mobile (Android only): native account picker via @react-native-google-signin (no Firebase, so no
   config plugin; Play services refreshes tokens, nothing stored), `expo-dev-client`; needs an EAS
   development build, not Expo Go. Its Android OAuth client must be in the same Cloud project as the
   desktop client (appDataFolder is per project). Mobile code is typechecked and bundles; untested on a phone.
6. Domain upgrades, one at a time:
   a. DONE — money as integer cents with one synced currency, km canonical with km/mi display
      (migration v5: `maintenance_logs.cost_cents`, `preferences` table; old per-device currency
      symbol / unit settings are adopted once). Verified on a copy of the real DB (costs exact).
   b. DONE — odometer readings (migration v6 `odometer_readings`: synced, moved on VIN merge, in backups);
      `VehicleRead.current_mileage` = max(initial, logs, readings) feeds the engine and every odometer display.
   c. DONE — garage visits: migration v7 `service_events` (date, mileage, shop, notes) + `maintenance_logs.event_id`;
      each item is a log, so the engine is unchanged; logs without event_id are single-item visits.
   d. DONE — reminders (core `maintenance/reminders.ts`, one key per due occurrence, app_settings `reminders.*`):
      desktop tauri-plugin-notification; mobile expo-notifications + 09:00 due-date ones (new EAS build needed).

## Known open issues

- Desktop's "Save/Import backup file" buttons still use `carbaddie_backup.json` (drive.file); mobile no
  longer reads or writes it.
- The engine (`upcoming.ts`) rounds day gaps up, so across the autumn DST change `remainingDays` is one too
  many (`Math.round` would fix it); reminders.ts compensates for its keys and due dates.
- No iOS sign-in yet (needs an iOS OAuth client and the plugin's `iosUrlScheme`).
- Visits made by migration v7 (co-performed logs grouped by vehicle+date+mileage) keep the logs'
  `updated_at`, so a grouping only one device could make (it held unsynced logs) stays local until those
  logs are edited.
- The phone needs a new EAS development build for expo-notifications (reminders); step 6 UIs are only
  typechecked/built, not yet tried on screen.
- Sync stalls silently if a device's change file is missing from Drive with no snapshot covering it
  (e.g. files deleted by hand): `engine.ts` stops at the gap and reports nothing.
- Tauri capability allows writing text files anywhere (`"**"`).
