import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sessionFile = path.join(repoRoot, ".run", "dev-session.json");

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

async function readSession() {
  try {
    const raw = await fs.readFile(sessionFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function clearSession() {
  try {
    await fs.unlink(sessionFile);
  } catch {
    // ignore
  }
}

async function main() {
  const session = await readSession();
  if (!session?.childPid) {
    // eslint-disable-next-line no-console
    console.log("No tracked dev session found.");
    return;
  }

  if (!processExists(session.childPid)) {
    await clearSession();
    // eslint-disable-next-line no-console
    console.log(`Tracked dev pid ${session.childPid} is already stopped.`);
    return;
  }

  await killProcessTree(session.childPid);
  await clearSession();
  // eslint-disable-next-line no-console
  console.log(`Stopped dev session (pid=${session.childPid}).`);
}

void main();
