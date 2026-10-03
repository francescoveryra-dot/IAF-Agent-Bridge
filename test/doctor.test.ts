import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../dist/config.js";
import { runDoctor } from "../dist/doctor.js";
import type { SpawnSpec } from "../dist/types.js";

const fixture = fileURLToPath(new URL("./fixtures/fake-acp.mjs", import.meta.url));

function spec(): SpawnSpec {
  return { command: process.execPath, args: [fixture] };
}

test("doctor reports the bridge, runtime, and cursor probe without account details", async () => {
  const dir = mkdtempSync(join(tmpdir(), "iaf-doctor-"));
  const report = await runDoctor({
    workspace: dir,
    spawnSpec: spec(),
    config: loadConfig({ IAF_HANDSHAKE_TIMEOUT_MS: "2000", IAF_VERSION_PROBE_TIMEOUT_MS: "2000" }),
    clientInfo: { name: "codex", version: "1.0.0", capabilities: {} },
  });
  const cursor = report.cursor as { found: boolean; version: string; authenticated: unknown };
  assert.equal(cursor.found, true);
  assert.equal(cursor.version, "9.9.9-test");
  assert.equal(cursor.authenticated, true);
  assert.equal(JSON.stringify(report).includes("@"), false);
  const bridge = report.bridge as { name: string; version: string };
  assert.equal(bridge.name, "iaf-agent-bridge");
  assert.equal(bridge.version, "1.1.0");
});

test("deep doctor completes an ACP handshake", async () => {
  const dir = mkdtempSync(join(tmpdir(), "iaf-doctor-deep-"));
  const report = await runDoctor({
    deep: true,
    workspace: dir,
    spawnSpec: spec(),
    config: loadConfig({ IAF_HANDSHAKE_TIMEOUT_MS: "2000", IAF_VERSION_PROBE_TIMEOUT_MS: "2000" }),
  });
  const cursor = report.cursor as { handshake?: { ok?: boolean; sessionOpened?: boolean; sessionClosed?: boolean; modes?: string[] } };
  assert.equal(cursor.handshake?.ok, true);
  assert.equal(cursor.handshake?.sessionOpened, true);
  assert.equal(cursor.handshake?.sessionClosed, true);
  assert.deepEqual(cursor.handshake?.modes, ["agent", "plan", "ask"]);
});
