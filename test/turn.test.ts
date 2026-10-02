import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../dist/config.js";
import { BridgeError } from "../dist/errors.js";
import { runTurn } from "../dist/turn.js";
import type { SpawnSpec } from "../dist/types.js";

const fixture = fileURLToPath(new URL("./fixtures/fake-acp.mjs", import.meta.url));

function spec(script: string, extra: Record<string, string> = {}): SpawnSpec {
  return {
    command: process.execPath,
    args: [fixture],
    env: { ...process.env, FAKE_ACP_SCRIPT: script, ...extra },
  };
}

function workspace(): string {
  return mkdtempSync(join(tmpdir(), "iaf-turn-"));
}

const fast = loadConfig({ IAF_HANDSHAKE_TIMEOUT_MS: "2000", IAF_TURN_TIMEOUT_MS: "2000", IAF_IDLE_TIMEOUT_MS: "0" });

test("a prompt streams Cursor's reply and returns the session id", async () => {
  const dir = workspace();
  writeFileSync(join(dir, "MASTER_PROMPT.md"), "# spec\n");
  const result = await runTurn({ prompt: "Say hello", workspace: dir, spawnSpec: spec("stream"), config: fast });
  assert.equal(result.sessionId, "session-test");
  assert.equal(result.resumed, false);
  assert.equal(result.result, "Hello from Cursor");
  assert.equal(result.stopReason, "end_turn");
  assert.deepEqual(result.projectContextFiles, ["MASTER_PROMPT.md"]);
  assert.equal(result.executor, "cursor");
});

test("resume loads the same session", async () => {
  const result = await runTurn({
    prompt: "Continue",
    workspace: workspace(),
    sessionId: "session-existing",
    spawnSpec: spec("stream"),
    config: fast,
  });
  assert.equal(result.sessionId, "session-existing");
  assert.equal(result.resumed, true);
});

test("a missing session is reported instead of starting over", async () => {
  await assert.rejects(
    () => runTurn({ prompt: "Continue", workspace: workspace(), sessionId: "missing", spawnSpec: spec("load-fail"), config: fast }),
    (err: unknown) => err instanceof BridgeError && err.reason === "session-not-found",
  );
});

test("ordinary permissions are allowed and destructive ones are rejected", async () => {
  const allowed = await runTurn({
    prompt: "Run tests",
    workspace: workspace(),
    spawnSpec: spec("permission", { FAKE_ACP_COMMAND: "npm test" }),
    config: fast,
  });
  assert.match(allowed.result, /decision:allow-once/);
  assert.equal(allowed.permissionDecisions?.[0]?.action, "allow");

  const rejected = await runTurn({
    prompt: "Force push",
    workspace: workspace(),
    spawnSpec: spec("permission", { FAKE_ACP_COMMAND: "git push --force origin main" }),
    config: fast,
  });
  assert.match(rejected.result, /decision:reject-once/);
  assert.equal(rejected.permissionDecisions?.[0]?.action, "reject");
});

test("Cursor questions are returned for the supervisor to answer", async () => {
  const result = await runTurn({ prompt: "Build it", workspace: workspace(), spawnSpec: spec("question"), config: fast });
  assert.equal(result.cursorQuestions?.[0]?.prompt, "Which database?");
  assert.match(result.result, /supervisor/);
});

test("agent mode accepts a plan and plan mode records it", async () => {
  const agent = await runTurn({ prompt: "Build it", workspace: workspace(), mode: "agent", spawnSpec: spec("plan"), config: fast });
  assert.equal(agent.plan?.name, "Build the app");
  const planned = await runTurn({ prompt: "Draft a plan", workspace: workspace(), mode: "plan", spawnSpec: spec("plan"), config: fast });
  assert.match(planned.plan?.detail ?? "", /Create the server/);
});

test("todo updates and reported files are collected", async () => {
  const result = await runTurn({ prompt: "Implement", workspace: workspace(), spawnSpec: spec("todos"), config: fast });
  assert.equal(result.todoProgress?.total, 2);
  assert.equal(result.todoProgress?.completed, 1);
  assert.deepEqual(result.filesReportedByEditTools, ["src/app.ts"]);
});

test("malformed ACP frames do not drop the reply", async () => {
  const result = await runTurn({ prompt: "Say hello", workspace: workspace(), spawnSpec: spec("malformed"), config: fast });
  assert.match(result.result, /Hello from Cursor/);
  assert.match(result.protocolWarnings?.join(" ") ?? "", /malformed/);
});

test("an agent exit and a turn timeout are structured failures", async () => {
  await assert.rejects(
    () => runTurn({ prompt: "Auth", workspace: workspace(), spawnSpec: spec("auth-fail"), config: fast }),
    (err: unknown) => err instanceof BridgeError && err.reason === "auth-required",
  );
  await assert.rejects(
    () => runTurn({
      prompt: "Wait",
      workspace: workspace(),
      spawnSpec: spec("hang"),
      config: fast,
    turnTimeoutMs: 400,
    }),
    (err: unknown) => err instanceof BridgeError && err.reason === "turn-timeout" && err.sessionId === "session-test",
  );
});

test("context files are attached and a bad effort fails before the prompt", async () => {
  const dir = workspace();
  writeFileSync(join(dir, "notes.txt"), "hello\n");
  const attached = await runTurn({
    prompt: "Read the note",
    workspace: dir,
    contextFiles: ["notes.txt", "missing.txt"],
    spawnSpec: spec("stream"),
    config: fast,
  });
  assert.match(attached.result, /attached Hello from Cursor/);
  assert.match(attached.protocolWarnings?.join(" ") ?? "", /missing.txt/);

  await assert.rejects(
    () => runTurn({
      prompt: "Think harder",
      workspace: dir,
      effort: "ultra",
      spawnSpec: spec("stream"),
      config: fast,
    }),
    (err: unknown) => err instanceof BridgeError && err.reason === "invalid-effort",
  );
});

test("an unknown model fails before the prompt is treated as success", async () => {
  await assert.rejects(
    () => runTurn({ prompt: "Use a model", workspace: workspace(), model: "nope", spawnSpec: spec("stream"), config: fast }),
    (err: unknown) => err instanceof BridgeError && err.reason === "invalid-model",
  );
});

test("nested executor processes refuse to delegate", async () => {
  const previous = process.env.IAF_AGENT_BRIDGE_EXECUTOR;
  process.env.IAF_AGENT_BRIDGE_EXECUTOR = "1";
  try {
    await assert.rejects(
      () => runTurn({ prompt: "Again", workspace: workspace(), spawnSpec: spec("stream"), config: fast }),
      (err: unknown) => err instanceof BridgeError && err.reason === "recursive-delegation",
    );
  } finally {
    if (previous === undefined) delete process.env.IAF_AGENT_BRIDGE_EXECUTOR;
    else process.env.IAF_AGENT_BRIDGE_EXECUTOR = previous;
  }
});
