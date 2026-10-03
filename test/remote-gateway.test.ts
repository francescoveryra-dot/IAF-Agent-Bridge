import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { setLogLevel } from "../dist/log.js";
import { createAllowlist, parseProjectList } from "../dist/remote/allowlist.js";
import { startLocalMcp, type LocalHandlers } from "../dist/remote/local-mcp.js";
import { setupChatgpt } from "../dist/remote/setup.js";

function textOf(result: { content?: Array<{ text?: string }> }): string {
  return result.content?.[0]?.text ?? "";
}

async function connect(url: string, token?: string): Promise<Client> {
  const client = new Client({ name: "local-mcp-test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), {
    requestInit: token ? { headers: { authorization: `Bearer ${token}` } } : {},
  }));
  return client;
}

function workspace(): string {
  return mkdtempSync(join(tmpdir(), "iaf-local-mcp-"));
}

test("project ids reject paths and a swapped symlink is refused", () => {
  assert.throws(() => parseProjectList("../tmp=/tmp"), /not allowed/);
  assert.throws(() => parseProjectList("bad/name=/tmp"), /not allowed/);
  const root = workspace();
  const project = join(root, "project");
  mkdirSync(project);
  const outside = workspace();
  const allowlist = createAllowlist({ demo: project });
  assert.equal(allowlist.resolve("demo"), realpathSync(project));
  rmSync(project, { recursive: true });
  symlinkSync(outside, project);
  assert.throws(() => allowlist.resolve("demo"), /no longer matches/);
  rmSync(project);
  assert.throws(() => allowlist.resolve("demo"), /not available/);
});

test("the personal server refuses a public bind and an unauthenticated token", async () => {
  const allowlist = createAllowlist({ demo: workspace() });
  await assert.rejects(() => startLocalMcp({ allowlist }));
  const server = await startLocalMcp({ allowlist, allowLoopbackTcp: true, token: "local-token-test-value", port: 0 });
  try {
    const missing = await fetch(server.mcpUrl, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(missing.status, 401);
    if (process.platform !== "win32") {
      const socket = await startLocalMcp({ allowlist, socketPath: join(workspace(), "chatgpt.sock") });
      assert.equal(statSync(socket.socketPath ?? "").mode & 0o777, 0o600);
      await socket.close();
    }
  } finally {
    await server.close();
  }
});

test("doctor hides local paths and three cycles keep prompts with the caller", async () => {
  const prompts: string[] = [];
  let resultSeen = false;
  const lines: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  setLogLevel("info");
  const handlers: LocalHandlers = {
    async delegate(input) {
      if (input.prompt.startsWith("AFTER_RESULT")) assert.equal(resultSeen, true);
      prompts.push(input.prompt);
      return {
        sessionId: "cursor-session",
        resumed: prompts.length > 1,
        executor: "cursor",
        result: `CURSOR_RESULT_${prompts.length}:${input.prompt}`,
        workspace: input.workspace,
        mode: input.mode,
      };
    },
    async doctor() {
      return { bridge: { name: "iaf-agent-bridge", version: "1.0.2" }, cursor: { found: true, authenticated: true, command: "/secret/agent", version: "test" }, workspace: "/secret/project" };
    },
    async cancel() {
      return { cancelled: true };
    },
  };
  const server = await startLocalMcp({ allowlist: createAllowlist({ demo: workspace() }), allowLoopbackTcp: true, handlers });
  const client = await connect(server.mcpUrl);
  try {
    const tools = await client.listTools();
    const annotations = Object.fromEntries(tools.tools.map((tool) => [tool.name, tool.annotations]));
    assert.equal(annotations.doctor?.readOnlyHint, true);
    assert.equal(annotations.delegate?.readOnlyHint, false);
    assert.equal(annotations.delegate?.destructiveHint, false);
    const doctor = JSON.parse(textOf(await client.callTool({ name: "doctor", arguments: { projectId: "demo" } }))) as { cursor: { found: boolean }; workspace?: string };
    assert.equal(doctor.cursor.found, true);
    assert.equal(JSON.stringify(doctor).includes("/secret"), false);
    const first = await client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: "UNIQUE_PROMPT_DO_NOT_LOG", clientRequestId: "request-0001" } });
    const firstBody = JSON.parse(textOf(first)) as { result: string; workspace?: string };
    assert.equal(firstBody.workspace, undefined);
    assert.match(firstBody.result, /UNIQUE_PROMPT_DO_NOT_LOG/);
    const replay = await client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: "replay must not run", sessionId: "cursor-session", clientRequestId: "request-0001" } });
    assert.equal(textOf(replay), textOf(first));
    resultSeen = true;
    const secondPrompt = `AFTER_RESULT_2 previous=${firstBody.result}`;
    const second = JSON.parse(textOf(await client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: secondPrompt, sessionId: "cursor-session", clientRequestId: "request-0002" } }))) as { result: string };
    const thirdPrompt = `AFTER_RESULT_3 previous=${second.result}`;
    await client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: thirdPrompt, sessionId: "cursor-session", clientRequestId: "request-0003" } });
    assert.deepEqual(prompts, ["UNIQUE_PROMPT_DO_NOT_LOG", secondPrompt, thirdPrompt]);
    const logged = lines.join("\n");
    assert.equal(logged.includes("UNIQUE_PROMPT_DO_NOT_LOG"), false);
    assert.equal(logged.includes("CURSOR_RESULT"), false);
    assert.match(logged, /remote\.delegate\.start/);
  } finally {
    process.stderr.write = original;
    setLogLevel("warn");
    await client.close();
    await server.close();
  }
});

test("rejects unknown projects, overlap, and oversized results", async () => {
  const releases: Array<() => void> = [];
  const server = await startLocalMcp({
    allowlist: createAllowlist({ demo: workspace() }),
    allowLoopbackTcp: true,
    handlers: {
      delegate(input) {
        if (input.prompt === "huge") return Promise.resolve({ result: "x".repeat(700_000) });
        return new Promise((resolve) => {
          const finish = () => resolve({ sessionId: "cursor-session", result: input.signal.aborted ? "aborted" : input.prompt, workspace: input.workspace, mode: "agent", executor: "cursor", resumed: false });
          if (input.signal.aborted) finish();
          else {
            input.signal.addEventListener("abort", finish, { once: true });
            releases.push(finish);
          }
        });
      },
      async doctor() {
        return { bridge: { version: "1.0.2" }, cursor: { found: true, authenticated: true } };
      },
      async cancel() {
        return { cancelled: true };
      },
    },
  });
  const client = await connect(server.mcpUrl);
  try {
    const missing = await client.callTool({ name: "delegate", arguments: { projectId: "other", prompt: "nope" } });
    assert.match(textOf(missing), /unknown-project/);
    const first = client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: "hold", sessionId: "cursor-session", clientRequestId: "request-hold1" } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const busy = await client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: "overlap", sessionId: "cursor-session", clientRequestId: "request-hold2" } });
    assert.match(textOf(busy), /session-busy/);
    const cancel = await client.callTool({ name: "cancel", arguments: { sessionId: "cursor-session" } });
    assert.match(textOf(cancel), /"cancelled":true/);
    assert.equal(JSON.parse(textOf(await first)).result, "aborted");
    const huge = await client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: "huge", clientRequestId: "request-huge1" } });
    assert.match(textOf(huge), /oversized-result/);
    assert.equal(textOf(huge).includes("x".repeat(100)), false);
  } finally {
    for (const release of releases) release();
    await client.close();
    await server.close();
  }
});

test("setup stores a private config for a generic project alias", async () => {
  const dir = workspace();
  const project = join(dir, "my-project");
  mkdirSync(project);
  const config = join(dir, "chatgpt.json");
  const saved = await setupChatgpt(`my-project=${project}`, {
    IAF_CHATGPT_CONFIG: config,
    IAF_CHATGPT_SOCKET: join(dir, "chatgpt.sock"),
  });
  assert.equal(saved.configPath, config);
  if (process.platform !== "win32") assert.equal(statSync(config).mode & 0o777, 0o600);
  const body = JSON.parse(readFileSync(config, "utf8")) as { projects: Record<string, string> };
  assert.equal(body.projects["my-project"], realpathSync(project));
  assert.equal(JSON.stringify(body).includes("sk-"), false);
  await assert.rejects(() => setupChatgpt("bad/name=/tmp", { IAF_CHATGPT_CONFIG: join(dir, "bad.json") }));
});
