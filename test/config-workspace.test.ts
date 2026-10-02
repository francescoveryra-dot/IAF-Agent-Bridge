import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../dist/config.js";
import { discoverProjectContextFiles } from "../dist/context-files.js";
import { locateCursorBinary } from "../dist/discovery.js";
import { BridgeError } from "../dist/errors.js";
import { log, setLogLevel } from "../dist/log.js";
import { redact } from "../dist/redact.js";
import { assertWorkspace } from "../dist/workspace.js";

test("config accepts safe defaults and rejects unknown executors", () => {
  const config = loadConfig({});
  assert.equal(config.executor, "cursor");
  assert.equal(config.permissionMode, "autonomous");
  assert.deepEqual(config.cursorAgentArgs, ["acp"]);
  assert.throws(() => loadConfig({ IAF_EXECUTOR: "codex" }), (err: unknown) => err instanceof BridgeError && err.reason === "executor-unavailable");
  assert.throws(() => loadConfig({ IAF_TURN_TIMEOUT_MS: "0" }), /IAF_TURN_TIMEOUT_MS/);
  assert.deepEqual(loadConfig({ IAF_CURSOR_AGENT_ARGS: "--foo" }).cursorAgentArgs, ["--foo", "acp"]);
});

test("workspace must be an existing project directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "iaf-ws-"));
  assert.equal(assertWorkspace(dir), assertWorkspace(dir));
  assert.throws(() => assertWorkspace(join(dir, "missing")), (err: unknown) => err instanceof BridgeError && err.reason === "invalid-workspace");
  assert.throws(() => assertWorkspace("/"), /filesystem root/);
  assert.throws(() => assertWorkspace(homedir()), /home directory/);
});

test("project context files are reported only when they exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "iaf-ctx-"));
  assert.deepEqual(discoverProjectContextFiles(dir), []);
  writeFileSync(join(dir, "MASTER_PROMPT.md"), "# context\n");
  assert.deepEqual(discoverProjectContextFiles(dir), ["MASTER_PROMPT.md"]);
});

test("logs go to stderr and redact secrets", () => {
  const original = process.stderr.write;
  const lines: string[] = [];
  process.stderr.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  const stdout: string[] = [];
  const originalOut = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    setLogLevel("info");
    log("info", "token=sk-supersecretvalue password=hunter2");
    setLogLevel("warn");
  } finally {
    process.stderr.write = original;
    process.stdout.write = originalOut;
  }
  assert.match(lines.join(""), /\[redacted\]/);
  assert.equal(stdout.length, 0);
  assert.equal(redact("Authorization: Bearer abcdefghijklmnop"), "Authorization: Bearer [redacted]");
});

test("an explicit cursor binary must exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "iaf-bin-"));
  const bin = join(dir, "agent");
  writeFileSync(bin, "#!/bin/sh\necho ok\n");
  chmodSync(bin, 0o755);
  const config = loadConfig({ IAF_CURSOR_AGENT: bin });
  assert.equal(locateCursorBinary(config, {}), bin);
  assert.throws(() => locateCursorBinary(loadConfig({ IAF_CURSOR_AGENT: join(dir, "missing") }), {}), /not executable/);
});
