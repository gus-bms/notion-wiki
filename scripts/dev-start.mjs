import { spawn, execSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const runDir = path.join(repoRoot, ".run");
const sessionFile = path.join(runDir, "dev-session.json");

function getTurboBin() {
  return path.join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "turbo.cmd" : "turbo");
}

function getSpawnTarget() {
  const turboArgs = [
    "run",
    "dev",
    "--parallel",
    "--filter=@notion-wiki/api",
    "--filter=@notion-wiki/worker",
    "--filter=@notion-wiki/web"
  ];

  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `turbo ${turboArgs.join(" ")}`]
    };
  }

  return {
    command: getTurboBin(),
    args: turboArgs
  };
}

function processExists(pid) {
  if (!pid || !Number.isInteger(pid)) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function killProcessTree(pid) {
  if (!processExists(pid)) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.on("exit", () => resolve());
      killer.on("error", reject);
    });
    return;
  }

  process.kill(-pid, "SIGTERM");
}

async function readExistingSession() {
  try {
    const raw = await fs.readFile(sessionFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeSession(payload) {
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(sessionFile, JSON.stringify(payload, null, 2), "utf8");
}

async function clearSession() {
  try {
    await fs.unlink(sessionFile);
  } catch {
    // ignore
  }
}

async function freePorts(ports) {
  for (const port of ports) {
    if (process.platform === "win32") {
      try {
        const out = execSync(`netstat -aon | findstr :${port}`).toString();
        const lines = out.split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(parseInt(pid)) && pid !== "0") {
            execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
          }
        }
      } catch (e) {}
    } else {
      try {
        execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: "ignore" });
      } catch (e) {}
    }
  }
}

async function main() {
  await freePorts([3000, 5173]);

  const existing = await readExistingSession();
  if (existing?.childPid && processExists(existing.childPid)) {
    // eslint-disable-next-line no-console
    console.error(
      `Existing dev session is running (pid=${existing.childPid}). Run "npm run dev:stop" first.`
    );
    process.exit(1);
  }

  const target = getSpawnTarget();
  let child;
  try {
    child = spawn(target.command, target.args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
      detached: process.platform !== "win32"
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to start dev session:", error);
    process.exit(1);
  }

  await writeSession({
    startedAt: new Date().toISOString(),
    parentPid: process.pid,
    childPid: child.pid
  });

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (signal) {
      // eslint-disable-next-line no-console
      console.log(`\nReceived ${signal}, stopping dev session...`);
    }
    await killProcessTree(child.pid);
    await clearSession();
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  child.on("exit", async (code) => {
    await clearSession();
    process.exit(code ?? 0);
  });
}

void main();
