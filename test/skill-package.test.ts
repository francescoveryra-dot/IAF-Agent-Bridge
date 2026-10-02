import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("package metadata stays aligned and does not claim a published npm release", () => {
  const pkg = JSON.parse(read("package.json"));
  const server = JSON.parse(read("server.json"));
  const plugin = JSON.parse(read("plugin.json"));
  assert.equal(pkg.version, "1.0.0");
  assert.equal(server.version, pkg.version);
  assert.equal(plugin.version, pkg.version);
  assert.equal(pkg.name, "iaf-agent-bridge");
  assert.equal(JSON.stringify(server).includes("registry.npmjs.org"), false);
});

test("the supervisor skill encodes the natural loop and not a review bureaucracy", () => {
  const skill = read("skills/iaf-agent-bridge/SKILL.md");
  for (const word of ["CONTINUE", "COMPLETE", "BLOCKED"]) assert.match(skill, new RegExp(word));
  assert.match(skill, /sessionId/);
  assert.match(skill, /Do not automatically demand a fresh end-to-end suite/);
});
