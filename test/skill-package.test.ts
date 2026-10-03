import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { claimsPublishedNpmPackage } from "../dist/npm-publication.js";

const root = new URL("../", import.meta.url);
function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("package metadata stays aligned and records the published npm package", () => {
  const pkg = JSON.parse(read("package.json"));
  const server = JSON.parse(read("server.json"));
  const plugin = JSON.parse(read("plugin.json"));
  assert.equal(pkg.version, "1.0.1");
  assert.equal(pkg.mcpName, "io.github.francescoveryra-dot/iaf-agent-bridge");
  assert.equal(server.name, pkg.mcpName);
  assert.equal(server.version, pkg.version);
  assert.equal(plugin.version, pkg.version);
  const cursorPlugin = JSON.parse(read(".cursor-plugin/plugin.json"));
  const claudePlugin = JSON.parse(read(".claude-plugin/plugin.json"));
  assert.equal(cursorPlugin.version, pkg.version);
  assert.equal(claudePlugin.version, pkg.version);
  assert.equal(pkg.name, "iaf-agent-bridge");
  assert.equal(claimsPublishedNpmPackage(server), true);
});

test("plugin manifests start the portable checkout launcher", () => {
  const codex = JSON.parse(read(".codex-plugin/plugin.json"));
  const server = codex.mcpServers["iaf-agent-bridge"];
  assert.equal(server.command, "node");
  assert.deepEqual(server.args, ["./bin/iaf-agent-bridge.mjs"]);
  assert.equal(server.cwd, ".");
  const launcher = read("bin/iaf-agent-bridge.mjs");
  assert.match(launcher, /"dist", "cli\.js"/);
  assert.doesNotMatch(launcher, /\/Users\//);
  for (const path of [".claude-plugin/mcp.json", ".cursor-plugin/mcp.json", ".mcp.copilot.json"]) {
    assert.match(read(path), /bin\/iaf-agent-bridge\.mjs/);
    assert.doesNotMatch(read(path), /dist\/cli\.js/);
  }
});

test("the supervisor skill encodes the natural loop and not a review bureaucracy", () => {
  const skill = read("skills/iaf-agent-bridge/SKILL.md");
  for (const word of ["CONTINUE", "COMPLETE", "BLOCKED"]) assert.match(skill, new RegExp(word));
  assert.match(skill, /sessionId/);
  assert.match(skill, /Do not automatically demand a fresh end-to-end suite/);
});
