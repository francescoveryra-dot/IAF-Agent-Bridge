import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../dist/config.js";
import { BridgeError } from "../dist/errors.js";
import { runTurn } from "../dist/turn.js";
import type { SpawnSpec } from "../dist/types.js";

const fixture = fileURLToPath(new URL("./fixtures/fake-acp.mjs", import.meta.url));
const fast = loadConfig({ IAF_HANDSHAKE_TIMEOUT_MS: "2000", IAF_TURN_TIMEOUT_MS: "2000", IAF_IDLE_TIMEOUT_MS: "0" });

function spec(extra: Record<string, string>): SpawnSpec {
  return { command: process.execPath, args: [fixture], env: { ...process.env, FAKE_ACP_SCRIPT: "lifecycle", ...extra } };
}

function gateDir(): string {
  return mkdtempSync(join(tmpdir(), "iaf-gate-"));
}

function until(file: string): Promise<void> {
  if (existsSync(file)) return Promise.resolve();
  return new Promise((resolve) => {
    const watcher = watch(dirname(file), () => {
      if (existsSync(file)) {
        watcher.close();
        resolve();
      }
    });
    if (existsSync(file)) {
      watcher.close();
      resolve();
    }
  });
}

function release(dir: string, name: string): void {
  writeFileSync(join(dir, `${name}.go`), "1");
}

async function pendingTurn(dir: string, scenario: string, hooks?: { signal?: AbortSignal }) {
  let settled = false;
  const turn = runTurn({
    prompt: "Implement the feature",
    workspace: mkdtempSync(join(tmpdir(), "iaf-life-")),
    spawnSpec: spec({ FAKE_ACP_GATE: dir, FAKE_ACP_CASE: scenario }),
    config: fast,
  }, hooks).then((result) => {
    settled = true;
    return result;
  }, (err: unknown) => {
    settled = true;
    throw err;
  });
  return { turn, pending: () => !settled };
}

test("ordinary completion waits for the prompt response", async () => {
  const dir = gateDir();
  const run = await pendingTurn(dir, "intermediate");
  await until(join(dir, "after-text"));
  assert.equal(run.pending(), true);
  release(dir, "after-text");
  const result = await run.turn;
  assert.equal(result.stopReason, "end_turn");
  assert.match(result.result, /Implementation complete\. Tests pass\./);
});

test("report-like text does not resolve the turn", async () => {
  const dir = gateDir();
  const run = await pendingTurn(dir, "intermediate");
  await until(join(dir, "after-text"));
  assert.equal(run.pending(), true);
  release(dir, "after-text");
  const result = await run.turn;
  assert.equal(result.result, "Implementation complete. Tests pass.");
});

test("sub-agent notices do not resolve the turn", async () => {
  const dir = gateDir();
  const run = await pendingTurn(dir, "subagents");
  await until(join(dir, "mid"));
  assert.equal(run.pending(), true);
  release(dir, "mid");
  await until(join(dir, "after-task"));
  assert.equal(run.pending(), true);
  release(dir, "after-task");
  const result = await run.turn;
  assert.equal(result.stopReason, "end_turn");
  assert.match(result.result, /Implementation complete/);
  assert.match(result.result, /Reviewed\./);
});

test("a zero task count does not resolve the turn", async () => {
  const dir = gateDir();
  const run = await pendingTurn(dir, "zero");
  await until(join(dir, "zero"));
  assert.equal(run.pending(), true);
  release(dir, "zero");
  const result = await run.turn;
  assert.match(result.result, /Still working\./);
  assert.match(result.result, /Finished\./);
});

test("a respawned sub-agent does not resolve the turn", async () => {
  const dir = gateDir();
  const run = await pendingTurn(dir, "respawn");
  await until(join(dir, "reviewed"));
  assert.equal(run.pending(), true);
  release(dir, "reviewed");
  await until(join(dir, "spawned"));
  assert.equal(run.pending(), true);
  release(dir, "spawned");
  const result = await run.turn;
  assert.match(result.result, /Retested\./);
});

test("nested task notices do not resolve the turn", async () => {
  const dir = gateDir();
  const run = await pendingTurn(dir, "nested");
  await until(join(dir, "nested-running"));
  assert.equal(run.pending(), true);
  release(dir, "nested-running");
  await until(join(dir, "follow-up"));
  assert.equal(run.pending(), true);
  release(dir, "follow-up");
  const result = await run.turn;
  assert.match(result.result, /partial/);
  assert.match(result.result, /Follow-up\./);
});

test("an early prompt acceptance waits for the idle state", async () => {
  const dir = gateDir();
  const run = await pendingTurn(dir, "v2");
  await until(join(dir, "accepted"));
  assert.equal(run.pending(), true);
  release(dir, "accepted");
  await until(join(dir, "running"));
  assert.equal(run.pending(), true);
  release(dir, "running");
  const result = await run.turn;
  assert.equal(result.stopReason, "end_turn");
  assert.match(result.result, /Implementation complete\. Tests pass\./);
  assert.match(result.result, /Follow-up\./);
});

test("agent messages are kept across tool activity and thoughts are omitted", async () => {
  const aggregated = await runTurn({
    prompt: "Implement",
    workspace: mkdtempSync(join(tmpdir(), "iaf-life-")),
    spawnSpec: spec({ FAKE_ACP_CASE: "aggregate" }),
    config: fast,
  });
  assert.equal(aggregated.result, "Message A. Message B. Message C.");
  assert.equal(aggregated.resultSource, undefined);

  const visible = await runTurn({
    prompt: "Implement",
    workspace: mkdtempSync(join(tmpdir(), "iaf-life-")),
    spawnSpec: spec({ FAKE_ACP_CASE: "thoughts" }),
    config: fast,
  });
  assert.equal(visible.result, "visible");
});

test("a late idle error does not replace a terminal prompt response", async () => {
  const result = await runTurn({
    prompt: "Implement",
    workspace: mkdtempSync(join(tmpdir(), "iaf-life-")),
    spawnSpec: spec({ FAKE_ACP_CASE: "late" }),
    config: fast,
  });
  assert.equal(result.stopReason, "end_turn");
  assert.equal(result.result, "done");
});

test("an error stop reason is not a successful completion", async () => {
  await assert.rejects(
    () => runTurn({
      prompt: "Implement",
      workspace: mkdtempSync(join(tmpdir(), "iaf-life-")),
      spawnSpec: spec({ FAKE_ACP_CASE: "error-stop" }),
      config: fast,
    }),
    (err: unknown) => err instanceof BridgeError && err.reason === "agent-error",
  );
});

test("disconnect and timeout are not successful completion", async () => {
  await assert.rejects(
    () => runTurn({
      prompt: "Implement",
      workspace: mkdtempSync(join(tmpdir(), "iaf-life-")),
      spawnSpec: spec({ FAKE_ACP_CASE: "disconnect" }),
      config: fast,
    }),
    (err: unknown) => err instanceof BridgeError && err.reason === "agent-exit",
  );
  await assert.rejects(
    () => runTurn({
      prompt: "Wait",
      workspace: mkdtempSync(join(tmpdir(), "iaf-life-")),
      spawnSpec: {
        command: process.execPath,
        args: [fixture],
        env: { ...process.env, FAKE_ACP_SCRIPT: "hang" },
      },
      config: fast,
      turnTimeoutMs: 300,
    }),
    (err: unknown) => err instanceof BridgeError && err.reason === "turn-timeout",
  );
});

test("cancellation is not a successful completion", async () => {
  const dir = gateDir();
  const signal = new AbortController();
  const run = await pendingTurn(dir, "intermediate", { signal: signal.signal });
  await until(join(dir, "after-text"));
  assert.equal(run.pending(), true);
  signal.abort();
  await assert.rejects(
    () => run.turn,
    (err: unknown) => err instanceof BridgeError && err.reason === "cancelled",
  );
});

test("a finished turn can be resumed", async () => {
  const first = await runTurn({
    prompt: "Implement",
    workspace: mkdtempSync(join(tmpdir(), "iaf-life-")),
    spawnSpec: spec({ FAKE_ACP_CASE: "aggregate" }),
    config: fast,
  });
  const second = await runTurn({
    prompt: "Continue",
    workspace: mkdtempSync(join(tmpdir(), "iaf-life-")),
    sessionId: first.sessionId,
    spawnSpec: spec({ FAKE_ACP_CASE: "thoughts" }),
    config: fast,
  });
  assert.equal(second.resumed, true);
  assert.equal(second.sessionId, first.sessionId);
  assert.equal(second.result, "visible");
});
