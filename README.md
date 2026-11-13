# CarBaddie

Vehicle maintenance tracker for desktop and phone.

```
apps/
  desktop/   Tauri 2 + React app (Windows/macOS/Linux)
  mobile/    Expo / React Native app (Android/iOS)
  backend/   FastAPI sidecar used by the desktop app (to be replaced by direct SQLite)
packages/
  core/      Types and domain logic shared by both apps (due-date engine, vehicle identity)
```

## Setup

Requires Node 22.18+ (Node 24 LTS recommended) and pnpm 12 (`npm install -g pnpm`).

```sh
pnpm install          # once, from the repo root
pnpm typecheck        # typecheck every package
pnpm test             # run the shared core tests
pnpm desktop          # run the desktop app (needs the backend exe in apps/desktop/src-tauri)
pnpm mobile           # start the Expo dev server
```

The backend is a Python project; see `apps/backend/README.md`.
