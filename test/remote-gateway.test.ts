import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createAllowlist, parseProjectList } from "../dist/remote/allowlist.js";
import { startConnector, type RemoteHandlers } from "../dist/remote/connector.js";
import { startGateway, type GatewayServer } from "../dist/remote/gateway.js";

const CHAT = "chat-token-test-value";
const CONNECTOR = "connector-token-test-value";

function textOf(result: { content?: Array<{ text?: string }> }): string {
  return result.content?.[0]?.text ?? "";
}

async function mcp(url: string, token = CHAT): Promise<Client> {
  const client = new Client({ name: "remote-test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  }));
  return client;
}

async function pair(handlers: RemoteHandlers, timeouts: { offlineTimeoutMs?: number; ratePerMinute?: number } = {}) {
  const workspace = mkdtempSync(join(tmpdir(), "iaf-remote-"));
  const gateway = await startGateway({
    chatToken: CHAT,
    connectorToken: CONNECTOR,
    offlineTimeoutMs: timeouts.offlineTimeoutMs ?? 2_000,
    resultTimeoutMs: 5_000,
    pollWaitMs: 200,
    ratePerMinute: timeouts.ratePerMinute ?? 100,
  });
  const connector = await startConnector({
    gatewayUrl: gateway.url,
    connectorToken: CONNECTOR,
    allowlist: createAllowlist({ demo: workspace }),
    handlers,
    retryMs: 50,
  });
  return { gateway, connector, workspace };
}

test("rejects a public bind, a reused token, and a path-like project id", async () => {
  await assert.rejects(() => startGateway({ chatToken: CHAT, connectorToken: CONNECTOR, host: "0.0.0.0" }));
  await assert.rejects(() => startGateway({ chatToken: CHAT, connectorToken: CHAT }));
  assert.throws(() => parseProjectList("../tmp=/tmp"), /not allowed/);
});

test("anonymous and cross-token callers cannot reach MCP or the connector", async () => {
  const gateway = await startGateway({ chatToken: CHAT, connectorToken: CONNECTOR, pollWaitMs: 100, offlineTimeoutMs: 200, maxResultBytes: 32 });
  try {
    const missing = await fetch(gateway.mcpUrl, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(missing.status, 401);
    const crossed = await fetch(`${gateway.url}/connector/poll`, {
      method: "POST",
      headers: { authorization: `Bearer ${CHAT}`, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(crossed.status, 401);
    const malformed = await fetch(`${gateway.url}/connector/result`, {
      method: "POST",
      headers: { authorization: `Bearer ${CONNECTOR}`, "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    const huge = await fetch(`${gateway.url}/connector/result`, {
      method: "POST",
      headers: { authorization: `Bearer ${CONNECTOR}`, "content-type": "application/json" },
      body: JSON.stringify({ protocol: 1, id: "job-too-large", ok: true, result: "x".repeat(80) }),
    });
    assert.equal(huge.status, 413);
  } finally {
    await gateway.close();
  }
});

test("a connector-offline delegate fails without starting Cursor", async () => {
  const gateway = await startGateway({ chatToken: CHAT, connectorToken: CONNECTOR, offlineTimeoutMs: 200, pollWaitMs: 50, resultTimeoutMs: 1_000 });
  try {
    const client = await mcp(gateway.mcpUrl);
    const result = await client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: "do not run" } });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /connector-offline/);
    await client.close();
  } finally {
    await gateway.close();
  }
});

test("three supervisor cycles send prompts created only after the previous Cursor result", async () => {
  const prompts: string[] = [];
  let resultSeen = false;
  const { gateway, connector } = await pair({
    async delegate(input) {
      if (input.prompt.startsWith("AFTER_RESULT")) assert.equal(resultSeen, true);
      prompts.push(input.prompt);
      assert.equal(input.workspace.includes("iaf-remote-"), true);
      assert.equal(input.prompt.includes("/tmp"), false);
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
      return { bridge: { version: "1.0.2" }, cursor: { found: true, authenticated: true }, workspace: "/secret/path" };
    },
    async cancel() {
      return { cancelled: true };
    },
  });
  const client = await mcp(gateway.mcpUrl);
  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ["cancel", "delegate", "doctor"]);
    const annotations = Object.fromEntries(tools.tools.map((tool) => [tool.name, tool.annotations]));
    assert.equal(annotations.doctor?.readOnlyHint, true);
    assert.equal(annotations.delegate?.readOnlyHint, false);
    assert.equal(annotations.delegate?.destructiveHint, false);
    assert.equal(annotations.delegate?.idempotentHint, false);
    assert.equal(annotations.cancel?.readOnlyHint, false);
    assert.equal(annotations.cancel?.destructiveHint, false);
    const doctor = await client.callTool({ name: "doctor", arguments: {} });
    assert.equal(doctor.isError, undefined);
    assert.equal(textOf(doctor).includes("/secret/path"), false);

    const first = await client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: "Create stage one only.", clientRequestId: "request-0001" } });
    const firstBody = JSON.parse(textOf(first)) as { result: string; sessionId: string; workspace?: string };
    assert.equal(firstBody.workspace, undefined);
    assert.match(firstBody.result, /CURSOR_RESULT_1:Create stage one only\./);
    resultSeen = true;
    const replay = await client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: "this replay must not run", sessionId: firstBody.sessionId, clientRequestId: "request-0001" } });
    assert.equal(textOf(replay), textOf(first));

    const secondPrompt = `AFTER_RESULT_2 previous=${firstBody.result}`;
    const second = await client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: secondPrompt, sessionId: firstBody.sessionId, clientRequestId: "request-0002" } });
    const secondBody = JSON.parse(textOf(second)) as { result: string };
    assert.match(secondBody.result, /CURSOR_RESULT_2:AFTER_RESULT_2 previous=CURSOR_RESULT_1/);

    const thirdPrompt = `AFTER_RESULT_3 previous=${secondBody.result}`;
    const third = await client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: thirdPrompt, sessionId: firstBody.sessionId, clientRequestId: "request-0003" } });
    const thirdBody = JSON.parse(textOf(third)) as { result: string };
    assert.match(thirdBody.result, /AFTER_RESULT_3 previous=CURSOR_RESULT_2/);
    assert.deepEqual(prompts, ["Create stage one only.", secondPrompt, thirdPrompt]);
  } finally {
    await client.close();
    await connector.close();
    await gateway.close();
  }
});

test("rejects path input, unknown projects, same-session overlap, and can cancel", async () => {
  const releases: Array<() => void> = [];
  const calls: string[] = [];
  const { gateway, connector } = await pair({
    delegate(input) {
      calls.push(input.workspace);
      return new Promise((resolve) => {
        const finish = () => resolve({
          sessionId: input.sessionId ?? "cursor-session",
          result: input.signal.aborted ? "aborted" : input.prompt,
          resumed: false,
          executor: "cursor",
          workspace: input.workspace,
          mode: "agent",
        });
        if (input.signal.aborted) finish();
        else {
          input.signal.addEventListener("abort", finish, { once: true });
          releases.push(finish);
        }
      });
    },
    async doctor() {
      return { ok: true };
    },
    async cancel(input) {
      return { cancelled: true, sessionId: input.sessionId };
    },
  });
  const client = await mcp(gateway.mcpUrl);
  try {
    const traversed = await client.callTool({ name: "delegate", arguments: { projectId: "../etc", prompt: "nope" } });
    assert.equal(traversed.isError, true);
    const missing = await client.callTool({ name: "delegate", arguments: { projectId: "other", prompt: "nope" } });
    assert.match(textOf(missing), /unknown-project/);
    assert.equal(calls.length, 0);

    const first = client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: "hold", sessionId: "cursor-session", clientRequestId: "request-hold1" } });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const busy = await client.callTool({ name: "delegate", arguments: { projectId: "demo", prompt: "overlap", sessionId: "cursor-session", clientRequestId: "request-hold2" } });
    assert.match(textOf(busy), /session-busy/);
    const cancel = await client.callTool({ name: "cancel", arguments: { sessionId: "cursor-session" } });
    assert.match(textOf(cancel), /"cancelled":true/);
    const finished = JSON.parse(textOf(await first)) as { result: string };
    assert.equal(finished.result, "aborted");
    assert.equal(calls.length, 1);
  } finally {
    for (const release of releases) release();
    await client.close();
    await connector.close();
    await gateway.close();
  }
});

test("rate-limits repeated MCP posts", async () => {
  const gateway: GatewayServer = await startGateway({
    chatToken: CHAT,
    connectorToken: CONNECTOR,
    ratePerMinute: 1,
    pollWaitMs: 50,
  });
  try {
    const first = await fetch(gateway.mcpUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${CHAT}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "rate", version: "0" } } }),
    });
    const second = await fetch(gateway.mcpUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${CHAT}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
    });
    assert.equal(first.status === 429 || second.status === 429, true);
  } finally {
    await gateway.close();
  }
});
