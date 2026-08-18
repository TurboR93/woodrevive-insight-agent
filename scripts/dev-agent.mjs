import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const bundledNode = resolve(
  homedir(),
  ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node",
);

const currentNodeMajor = Number(process.versions.node.split(".")[0]);
if (currentNodeMajor < 22 && !process.env.WOODREVIVE_NODE_RELAUNCHED) {
  try {
    await access(bundledNode, constants.X_OK);
    console.log(`Node ${process.versions.node} rilevato: riavvio automatico con il runtime compatibile.`);
    const relaunched = spawn(
      bundledNode,
      [...process.execArgv, ...process.argv.slice(1)],
      {
        cwd: root,
        env: { ...process.env, WOODREVIVE_NODE_RELAUNCHED: "1" },
        stdio: "inherit",
      },
    );
    const exit = await new Promise((resolveExit) => {
      relaunched.once("error", () => resolveExit(1));
      relaunched.once("exit", (code, signal) => resolveExit(signal ? 1 : (code ?? 1)));
    });
    process.exit(exit);
  } catch {
    console.error("WoodRevive Insight richiede Node.js 22 o successivo.");
    process.exit(1);
  }
}

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

const vinextCli = resolve(root, "node_modules/vinext/dist/cli.js");
const managerRoot = resolve(root, "apps/woodrevive-manager");
const managerViteCli = resolve(managerRoot, "node_modules/vite/bin/vite.js");

const processes = [
  spawn(process.execPath, ["--import", "tsx", "server/src/index.ts"], { cwd: root, env: process.env, stdio: "inherit" }),
  spawn(python, ["-m", "uvicorn", "app.main:app", "--app-dir", "analytics-service", "--host", "127.0.0.1", "--port", "8001"], {
    cwd: root, env: process.env, stdio: "inherit",
  }),
  // Usa lo stesso runtime Node con cui è stato avviato questo coordinatore.
  // Evita che lo shebang di `node_modules/.bin/vinext` selezioni un Node più vecchio.
  spawn(process.execPath, [vinextCli, "dev"], { cwd: root, env: process.env, stdio: "inherit" }),
  spawn(process.execPath, [managerViteCli, "--host", "127.0.0.1", "--port", "5174"], {
    cwd: managerRoot, env: process.env, stdio: "inherit",
  }),
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

console.log(`WoodRevive Insight + copia Manager avviati con Claude Haiku e Python: ${python}`);
