import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");

async function firstExecutable(candidates) {
  for (const candidate of candidates) {
    if (!candidate.includes("/")) return candidate;
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Prova il candidato successivo.
    }
  }
  return "python3";
}

const python = await firstExecutable([
  process.env.WOODREVIVE_PYTHON,
  resolve(root, ".venv/bin/python"),
  resolve(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"),
  "python3",
].filter(Boolean));

const processes = [
  spawn(process.execPath, ["--import", "tsx", "server/src/index.ts"], { cwd: root, env: process.env, stdio: "inherit" }),
  spawn(python, ["-m", "uvicorn", "app.main:app", "--app-dir", "analytics-service", "--host", "127.0.0.1", "--port", "8001"], {
    cwd: root, env: process.env, stdio: "inherit",
  }),
  spawn(resolve(root, "node_modules/.bin/vinext"), ["dev"], { cwd: root, env: process.env, stdio: "inherit" }),
];

let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of processes) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 350).unref();
}

process.on("SIGINT", () => close(0));
process.on("SIGTERM", () => close(0));
for (const child of processes) {
  child.on("error", (error) => {
    console.error(error.message);
    close(1);
  });
  child.on("exit", (code, signal) => {
    if (!closing && code !== 0) {
      console.error(`Un servizio si è arrestato (${signal || code}).`);
      close(code || 1);
    }
  });
}

console.log(`WoodRevive Insight avviato con Claude Haiku e Python: ${python}`);
