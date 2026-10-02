import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function dependenciesReady() {
  try {
    const { dependencies } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return Object.keys(dependencies ?? {}).every((name) => existsSync(join(root, "node_modules", name, "package.json")));
  } catch {
    return false;
  }
}

function run(args) {
  execFileSync(npm, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

try {
  if (!dependenciesReady()) run(["install", "--no-audit", "--no-fund"]);
  if (!existsSync(join(root, "dist", "cli.js"))) run(["run", "build"]);
} catch (err) {
  process.stderr.write(`iaf-agent-bridge: setup failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
