import { spawn, type ChildProcess } from "node:child_process";

/** Runs the loopback API and the Vite dev server together; stopping one stops both. */
const children: ChildProcess[] = [
  spawn(process.execPath, ["--watch", "src/api/main.ts"], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], { stdio: "inherit" }),
];

let stopping = false;
function stop(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}

for (const child of children) child.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
