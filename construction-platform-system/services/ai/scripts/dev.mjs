// Dev launcher for the AI tier — runs the FastAPI app AND the seam worker together,
// so `pnpm dev` (turbo) brings up both runtimes (web + ai) in one command (§4.4).
// Uses the venv's python if present, else `python`.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const venvPy =
  process.platform === "win32"
    ? path.join(root, ".venv", "Scripts", "python.exe")
    : path.join(root, ".venv", "bin", "python");
const py = existsSync(venvPy) ? venvPy : "python";

const procs = [
  ["uvicorn", ["app.main:app", "--port", "8000", "--reload"]],
  [py, ["-m", "app.worker"]],
];

const children = procs.map(([cmd, args]) =>
  spawn(cmd === "uvicorn" ? py : cmd, cmd === "uvicorn" ? ["-m", "uvicorn", ...args] : args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  }),
);

const shutdown = () => {
  for (const c of children) {
    try {
      c.kill();
    } catch {}
  }
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
for (const c of children) c.on("exit", shutdown);
