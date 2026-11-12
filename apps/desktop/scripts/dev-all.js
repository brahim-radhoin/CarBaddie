import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import http from "http";
import net from "net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const searchPaths = [join(__dirname, "..", "src-tauri", "target", "release"), join(__dirname, "..", "src-tauri")];

let exeName;
let releaseDir;

for (const path of searchPaths) {
  try {
    if (fs.existsSync(path)) {
      const files = fs.readdirSync(path);
      const found = files.find((file) => file.startsWith("carbaddie-backend") && file.endsWith(".exe"));
      if (found) {
        exeName = found;
        releaseDir = path;
        break;
      }
    }
  } catch (err) {
    console.warn(`Could not read directory ${path}:`, err);
  }
}

if (!exeName) {
  console.error("Backend executable not found in:", releaseDir);
  process.exit(1);
}

const backendExe = join(releaseDir, exeName);
const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000/";
const backendStartupTimeout = Number(process.env.BACKEND_STARTUP_TIMEOUT) || 20000;

function spawnBackend() {
  console.log("Spawning backend:", backendExe);
  return spawn(backendExe, [], {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd: join(__dirname, ".."),
    env: { ...process.env },
  });
}

function spawnFrontend() {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const cmd = `${npmCmd} run dev`;
  console.log("Starting frontend (vite)...", cmd);
  return spawn(cmd, {
    stdio: "inherit",
    shell: true, // shell:true avoids Windows EINVAL for command strings
    cwd: join(__dirname, ".."),
    env: { ...process.env },
  });
}

function waitForBackend(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        if (res.statusCode && res.statusCode < 500) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error("timeout waiting for backend"));
        setTimeout(tryOnce, 500);
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) return reject(new Error("timeout waiting for backend"));
        setTimeout(tryOnce, 500);
      });
      req.setTimeout(1000, () => req.destroy());
    };
    tryOnce();
  });
}

function isPortOpen(host, port, timeout = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    socket.setTimeout(timeout);
    socket.once("connect", () => {
      done = true;
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve(false);
      }
    });
    socket.once("timeout", () => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve(false);
      }
    });
    socket.connect(port, host);
  });
}

async function spawnBackendIfNeeded() {
  try {
    const url = new URL(backendUrl);
    const host = url.hostname;
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    const open = await isPortOpen(host, port);
    if (open) {
      console.log(`Backend already listening at ${host}:${port} — skipping spawn.`);
      return null;
    }
  } catch (e) {
    // If URL parse fails, proceed to spawn
  }
  return spawnBackend();
}

(async () => {
  let backend = null;
  try {
    backend = await spawnBackendIfNeeded();
  } catch (err) {
    console.error("Error checking backend port:", err);
    process.exit(1);
  }

  if (backend) {
    backend.on("error", (err) => {
      console.error("Backend spawn error:", err);
      process.exit(1);
    });
  }

  try {
    await waitForBackend(backendUrl, backendStartupTimeout);
    console.log("Backend ready:", backendUrl);
  } catch (err) {
    console.error("Backend did not become ready:", err.message);
    if (backend && !backend.killed) backend.kill();
    process.exit(1);
  }

  const frontend = spawnFrontend();

  frontend.on("error", (err) => {
    console.error("Frontend spawn error:", err);
    cleanup(1);
  });

  function cleanup(code = 0) {
    try {
      if (frontend && !frontend.killed) frontend.kill();
    } catch (e) {
      console.error("Failed to kill frontend process", e);
    }
    try {
      if (backend && !backend.killed) backend.kill();
    } catch (e) {
      console.error("Failed to kill backend process", e);
    }
    process.exit(code);
  }

  frontend.on("exit", (code) => cleanup(code ?? 0));
  if (backend) {
    backend.on("exit", (code) => {
      console.log("Backend exited with", code);
      cleanup(code ?? 0);
    });
  }

  process.on("SIGINT", () => cleanup(0));
  process.on("SIGTERM", () => cleanup(0));
})();
