#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(root, "dist", "cli.js");

function npmRun(args) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "inherit"],
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.stdout?.length) process.stderr.write(result.stdout);
  if (result.error) {
    process.stderr.write(`iaf-agent-bridge: ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.stderr.write(`iaf-agent-bridge: setup exited ${result.status ?? "from a signal"}\n`);
    process.exit(result.status || 1);
  }
}

if (!existsSync(cli)) {
  process.stderr.write("iaf-agent-bridge: building the MCP server from this checkout\n");
  npmRun(["install", "--no-audit", "--no-fund"]);
  npmRun(["run", "build"]);
}

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
child.on("error", (err) => {
  process.stderr.write(`iaf-agent-bridge: ${err.message}\n`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
