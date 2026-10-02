import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTurn } from "../dist/turn.js";

const workspace = mkdtempSync(join(tmpdir(), "iaf-cursor-smoke-"));

try {
  const result = await runTurn({
    prompt: "Reply with exactly the token IAF_SMOKE_OK and nothing else. Do not create, edit, or delete files. Do not run shell commands.",
    workspace,
    mode: "ask",
    turnTimeoutMs: 180_000,
    handshakeTimeoutMs: 30_000,
  });
  const ok = result.result.includes("IAF_SMOKE_OK");
  process.stdout.write(`${JSON.stringify({
    ok,
    sessionId: result.sessionId,
    stopReason: result.stopReason ?? null,
    result: result.result.slice(0, 500),
  }, null, 2)}\n`);
  if (!ok) process.exitCode = 1;
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
