# CarBaddie 🚗

A comprehensive desktop vehicle maintenance tracking application built with Tauri, React, and Python. CarBaddie helps you manage your vehicle fleet, track maintenance schedules, and monitor service history with a beautiful, modern interface.

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

### Backend

- **Framework**: Python FastAPI
- **Database**: SQLite with async support (aiosqlite)
- **ORM**: SQLAlchemy 2.0 with async
- **Migrations**: Alembic
- **Packaging**: PyInstaller (for standalone executable)

### Development Tools

- **Linting**: ESLint with TypeScript support
- **Type Checking**: TypeScript strict mode
- **Testing**: Pytest (backend)

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

### Required

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Rust** (latest stable) - [Install here](https://www.rust-lang.org/tools/install)
- **Python** (3.11 or higher) - [Download here](https://www.python.org/)

### Platform-Specific Requirements

#### Windows

- **Microsoft C++ Build Tools** - [Download here](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- **WebView2** (usually pre-installed on Windows 10/11)

#### macOS

- **Xcode Command Line Tools**: `xcode-select --install`

#### Linux

- **System dependencies**:
  ```bash
  sudo apt-get update
  sudo apt-get install -y libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
  ```

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/carBaddie_frontend_SAA.git
cd carBaddie_frontend_SAA
```

### 2. Install Frontend Dependencies

```bash
npm install
```

### 3. Set Up Backend

The backend is located in a separate repository but needs to be built before running the app.

#### Clone the Backend Repository

```bash
cd ..
git clone https://github.com/yourusername/CarBaddie_backend_SAA.git
cd CarBaddie_backend_SAA
```

#### Create Python Virtual Environment

```bash
python -m venv .venv
```

#### Activate Virtual Environment

- **Windows**: `.venv\Scripts\activate`
- **macOS/Linux**: `source .venv/bin/activate`

#### Install Backend Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Create a `.env` file in the frontend root directory:

```env
VITE_API_URL=http://localhost:8000
```

Backend `.env` (in the backend directory):

```env
DATABASE_URL=sqlite+aiosqlite:///./car_baddie.db
```

## 🏗️ Building the Application

### Development Build

#### Option 1: Run Everything Together (Recommended)

```bash
# From the frontend directory
npm run dev:all
```

This runs both the Tauri app and the backend simultaneously.

#### Option 2: Run Separately

Terminal 1 (Backend):

```bash
cd CarBaddie_backend_SAA
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # macOS/Linux
python run_server.py
```

Terminal 2 (Frontend):

```bash
cd carBaddie_frontend_SAA
npm run tauri dev
```

### Production Build

#### Step 1: Build the Backend Executable

From the backend directory:

```bash
# Windows
pyinstaller carbaddie-backend-x86_64-pc-windows-msvc.spec

# Copy the built executable to the frontend's src-tauri directory
copy dist\carbaddie-backend-x86_64-pc-windows-msvc.exe ..\carBaddie_frontend_SAA\src-tauri\carbaddie-backend-x86_64-pc-windows-msvc.exe
```

```bash
# macOS
pyinstaller carbaddie-backend.spec

# Copy the built executable
cp dist/carbaddie-backend ../carBaddie_frontend_SAA/src-tauri/carbaddie-backend-aarch64-apple-darwin
```

```bash
# Linux
pyinstaller carbaddie-backend.spec

# Copy the built executable
cp dist/carbaddie-backend ../carBaddie_frontend_SAA/src-tauri/carbaddie-backend-x86_64-unknown-linux-gnu
```

#### Step 2: Build the Tauri Application

From the frontend directory:

```bash
npm run tauri build
```

The built application will be in `src-tauri/target/release/bundle/`:

- **Windows**: `.msi` installer in `msi/` subfolder
- **macOS**: `.dmg` in `dmg/` subfolder or `.app` in `macos/` subfolder
- **Linux**: `.deb`, `.AppImage` in their respective subfolders

## 📁 Project Structure

```
carBaddie_frontend_SAA/
├── src/
│   ├── components/          # Reusable React components
│   │   ├── ui/             # UI primitive components (buttons, dialogs, etc.)
│   │   ├── ExportSection.tsx
│   │   ├── ModeToggle.tsx
│   │   └── ...
│   ├── pages/              # Application pages/routes
│   │   ├── AddVehiclePage.tsx
│   │   ├── VehicleDetailPage.tsx
│   │   ├── VehicleMaintenancePage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── ...
│   ├── lib/                # Utilities and helpers
│   │   ├── api.ts          # API client
│   │   └── utils.ts        # Utility functions
│   ├── App.tsx             # Main application component
│   ├── main.tsx            # Application entry point
│   └── index.css           # Global styles
├── src-tauri/              # Tauri backend
│   ├── src/
│   │   ├── lib.rs          # Rust commands and backend spawning
│   │   └── main.rs         # Tauri entry point
│   ├── icons/              # Application icons
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
├── public/                 # Static assets
├── scripts/                # Build and dev scripts
├── package.json            # Node dependencies and scripts
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript configuration
└── README.md               # This file
```

## 🧪 Development Scripts

```bash
# Start development server (frontend only)
npm run dev

# Start full development environment (frontend + backend)
npm run dev:all

# Build frontend for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint

# Start Tauri in development mode
npm run tauri dev

# Build Tauri application
npm run tauri build
```

## 🔧 Configuration

### Tauri Configuration

Edit `src-tauri/tauri.conf.json` to customize:

- Application name and identifier
- Window dimensions and behavior
- Bundled resources
- Icons and metadata

### Build Configuration

The application bundles:

- Python backend executable as an external binary
- SQLite database (`car_baddie.db`) as a resource
- Application icons for all platforms

## 🐛 Troubleshooting

### Backend Won't Start

- Ensure Python virtual environment is activated
- Check that all Python dependencies are installed
- Verify the database path in the `.env` file

### Build Fails on Windows

- Install Microsoft C++ Build Tools
- Ensure Rust is properly installed and in PATH
- Try running in a fresh terminal after installing dependencies

### Database Errors

- Delete `car_baddie.db` and restart (will create a fresh database)
- Check that migrations have run successfully
- Verify database file permissions

### PyInstaller Issues

- Ensure all hidden imports are specified in the `.spec` file
- Check that `aiosqlite` is explicitly imported in `run_server.py`
- Verify the correct architecture-specific spec file is used

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
