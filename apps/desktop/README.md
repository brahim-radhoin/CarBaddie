# CarBaddie 🚗

A comprehensive desktop vehicle maintenance tracking application built with Tauri, React, and SQLite. CarBaddie helps you manage your vehicle fleet, track maintenance schedules, and monitor service history with a beautiful, modern interface.

![CarBaddie](https://img.shields.io/badge/version-0.1.0-blue)
![Tauri](https://img.shields.io/badge/Tauri-2.8.0-blue)
![React](https://img.shields.io/badge/React-19.0.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7.2-blue)

## ✨ Features

### Vehicle Management

- **Multiple Vehicle Support**: Manage an unlimited number of vehicles in your fleet
- **Comprehensive Vehicle Profiles**: Track make, model, year, VIN, license plate, mileage, and more
- **Vehicle Images**: Attach custom images to your vehicles
- **Custom Fields**: Add custom metadata to track specific information

### Maintenance Tracking

- **Service History**: Comprehensive logging of all maintenance activities
- **Service Types**: Create and manage custom service types with configurable intervals
- **Mileage & Time-based Scheduling**: Track services by both mileage intervals and time periods
- **Reminder System**: Get notified when services are due based on mileage or date
- **Parts & Costs**: Track parts used, labor costs, and total expenses
- **Notes & Documentation**: Add detailed notes and documentation for each service

### Data Management

- **Export/Import**: Backup and restore your entire database
- **CSV Export**: Export maintenance logs to CSV for analysis
- **Vehicle Make/Model Database**: Pre-populated database of thousands of vehicle makes and models
- **Database Migrations**: Automatic schema updates with Alembic

### User Experience

- **Dark/Light Mode**: Beautiful themed interface with customizable color schemes
- **Color Presets**: Multiple color themes (Zinc, Slate, Stone, Gray, Neutral, Red, Rose, Orange, Green, Blue, Yellow, Violet)
- **Activity Calendar**: Visual tracking of maintenance activities
- **Statistics Dashboard**: Insights into your maintenance patterns
- **Responsive Design**: Modern, intuitive UI built with Radix UI components

## 🛠️ Tech Stack

### Frontend

- **Framework**: React 19 with TypeScript
- **Desktop Runtime**: Tauri 2.8
- **Styling**: TailwindCSS 4 with custom design tokens
- **UI Components**: Radix UI primitives
- **State Management**: TanStack Query (React Query)
- **Routing**: React Router v7
- **Charts**: Recharts
- **Build Tool**: Vite 6

### Data

- **Database**: SQLite in the app data directory, one connection owned by the Rust shell (`rusqlite`)
- **Domain and queries**: `@carbaddie/core` (shared with the mobile app): repository, migrations,
  due-date engine, backup format
- **Vehicle catalog**: read-only JSON asset (`src/data/vehicle-catalog.json`), loaded on first use

### Development Tools

- **Linting**: ESLint with TypeScript support
- **Type Checking**: TypeScript strict mode
- **Testing**: `node --test` in `packages/core`

## 📋 Prerequisites

- **Node.js** 22.18+ and **pnpm** 12 (the repo pins it via `packageManager`)
- **Rust** (stable) - [Install here](https://www.rust-lang.org/tools/install)
- Platform requirements for Tauri:
  - **Windows**: [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and WebView2
  - **macOS**: `xcode-select --install`
  - **Linux**: `sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev`

## 🚀 Getting Started

This app lives in the CarBaddie monorepo. From the repository root:

```bash
pnpm install
pnpm desktop        # runs `tauri dev`
```

There is no separate backend to start: the app opens its SQLite database directly.

### Production Build

```bash
pnpm --filter @carbaddie/desktop run tauri build
```

The built application is in `src-tauri/target/release/bundle/` (`.msi` on Windows, `.dmg`/`.app` on
macOS, `.deb`/`.AppImage` on Linux).

## 📁 Project Structure

```
apps/desktop/
├── src/
│   ├── api.ts              # React Query hooks over the repository
│   ├── db.ts               # Opens the database and the @carbaddie/core repository
│   ├── data/               # Read-only assets (vehicle catalog)
│   ├── components/         # React components (ui/ holds the primitives)
│   ├── pages/              # Application pages/routes
│   ├── hooks/              # useDatabaseBootstrap, useVehicleDefinitions, ...
│   └── services/           # Google Drive backup
└── src-tauri/
    ├── src/db.rs           # SQLite commands: db_open, db_exec, db_run, db_all
    ├── src/lib.rs          # Plugins, OAuth loopback listener, command registration
    └── tauri.conf.json
```

## 💾 Your Data

- The database is `car_baddie.db` in the app data directory
  (Windows: `%APPDATA%\com.carbaddie.app\`). It is created on first run; nothing is bundled.
- On start the schema is migrated to the latest version (`packages/core/src/db/migrations.ts`).
  Before any upgrade the previous file is copied to `car_baddie.before-v<N>-<timestamp>.db` next to it.
- Settings → Export writes a JSON backup that the mobile app can also restore.

## 🐛 Troubleshooting

### "Database Error" on start

- The error screen shows the message and the database path. The original file is untouched if a
  migration fails (each migration runs in a transaction), and a pre-upgrade copy sits next to it.
- To start fresh, close the app and move `car_baddie.db` out of the app data directory.

### Build Fails on Windows

- Install Microsoft C++ Build Tools (also needed to compile the bundled SQLite)
- Ensure Rust is properly installed and in PATH
- Try running in a fresh terminal after installing dependencies

## 📝 License

This project is private and not licensed for public use.

## 🤝 Contributing

This is a personal project and is not currently accepting contributions.

## 📧 Contact

For questions or issues, please open an issue on GitHub.

## 🙏 Acknowledgments

- Built with [Tauri](https://tauri.app/)
- UI components from [Radix UI](https://www.radix-ui.com/)
- Vehicle data from [arthurkao/vehicle-make-model-data](https://github.com/arthurkao/vehicle-make-model-data)
- Icons from [Lucide](https://lucide.dev/)
