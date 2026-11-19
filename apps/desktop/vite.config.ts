import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tauriConf from "./src-tauri/tauri.conf.json";

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  // The version the installer carries, shown in the sidebar and settings.
  define: { __APP_VERSION__: JSON.stringify(tauriConf.version) },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
