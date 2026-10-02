import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packed = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
const entries = JSON.parse(packed);
const files = entries[0]?.files?.map((file) => file.path) ?? [];
for (const name of ["dist/cli.js", "README.md", "LICENSE", "skills/iaf-agent-bridge/SKILL.md"]) {
  if (!files.includes(name)) {
    process.stderr.write(`package is missing ${name}\n`);
    process.exit(1);
  }
}
const version = execFileSync("node", ["dist/cli.js", "--version"], { encoding: "utf8" }).trim();
if (!version) process.exit(1);
const dir = mkdtempSync(join(tmpdir(), "iaf-pack-"));
try {
  const doctor = spawnSync("node", ["dist/cli.js", "doctor", "--json", "--workspace", dir], { encoding: "utf8" });
  const report = JSON.parse(doctor.stdout);
  if (report.bridge?.name !== "iaf-agent-bridge") process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.stdout.write(`package smoke ok ${version}\n`);
