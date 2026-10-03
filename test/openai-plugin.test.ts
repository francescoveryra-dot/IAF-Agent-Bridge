import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(path, root), "utf8")) as Record<string, unknown>;
}

test("the portable OpenAI package launches the published npm server", () => {
  const plugin = readJson("plugin.json");
  const mcp = readJson("mcp.json");
  const codex = readJson(".codex-plugin/plugin.json");
  assert.equal(plugin.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(plugin.mcpServers, "./.mcp.copilot.json");
  const openai = (plugin.extensions as { "com.openai": { interface: { displayName: string; logo: string } } })["com.openai"];
  assert.equal(openai.interface.displayName, "IAF Agent Bridge");
  assert.equal(openai.interface.logo, "./assets/logo.svg");
  assert.equal(mcp.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
  const server = (mcp.mcpServers as Record<string, { type: string; command: string; args: string[]; cwd: string }>)["iaf-agent-bridge"];
  assert.equal(server.type, "stdio");
  assert.equal(server.command, "npx");
  assert.deepEqual(server.args, ["-y", "iaf-agent-bridge"]);
  assert.equal(server.cwd, "./");
  assert.equal(JSON.stringify(mcp).includes("/Users/"), false);
  assert.equal((codex.mcpServers as { "iaf-agent-bridge": { command: string; args: string[] } })["iaf-agent-bridge"].command, "node");
  assert.deepEqual((codex.mcpServers as { "iaf-agent-bridge": { args: string[] } })["iaf-agent-bridge"].args, ["./bin/iaf-agent-bridge.mjs"]);
});
