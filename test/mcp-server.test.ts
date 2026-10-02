import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AcpClient } from "../dist/acp-client.js";
import { buildServer } from "../dist/mcp-server.js";

async function connect(server: ReturnType<typeof buildServer>["server"], name = "codex-test") {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name, version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

test("the server exposes delegate, cancel, and doctor", async () => {
  const bridge = buildServer({
    runTurn: async () => ({ sessionId: "s1", result: "done", resumed: false, executor: "cursor", workspace: "/tmp/project", mode: "agent" }),
    runDoctor: async () => ({ bridge: { name: "iaf-agent-bridge", version: "1.0.0" }, hints: [] }),
  });
  const client = await connect(bridge.server);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ["cancel", "delegate", "doctor"]);
  const delegated = await client.callTool({ name: "delegate", arguments: { prompt: "Implement the feature", workspace: "/tmp/project" } });
  const text = (delegated.content as Array<{ text: string }>)[0]?.text ?? "";
  assert.match(text, /"sessionId":"s1"/);
  assert.equal(delegated.isError, undefined);
  await client.close();
});

test("blank prompts are rejected by the tool schema", async () => {
  const bridge = buildServer({ runTurn: async () => ({}) });
  const client = await connect(bridge.server);
  const result = await client.callTool({ name: "delegate", arguments: { prompt: "  ", workspace: "/tmp/project" } });
  assert.equal(result.isError, true);
  await client.close();
});

test("cancel distinguishes a live session from an unknown id", async () => {
  const dir = mkdtempSync(join(tmpdir(), "iaf-mcp-"));
  let release: (() => void) | undefined;
  let started: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const bridge = buildServer({
    forceGraceMs: 10,
    runTurn: async (_input, hooks) => {
      const client = { cancel() {}, async stop() { return true; } } as unknown as AcpClient;
      hooks?.onClient?.(client);
      hooks?.onSession?.("sess-live", client);
      started();
      await new Promise<void>((resolve) => { release = resolve; });
      return { sessionId: "sess-live", result: "finished", resumed: false, executor: "cursor", workspace: dir, mode: "agent" };
    },
  });
  const mcp = await connect(bridge.server);
  const pending = mcp.callTool({ name: "delegate", arguments: { prompt: "Keep going", workspace: dir } });
  await ready;
  const cancelled = await mcp.callTool({ name: "cancel", arguments: { sessionId: "sess-live" } });
  assert.match((cancelled.content as Array<{ text: string }>)[0]?.text ?? "", /"status":"cancelled"/);
  const missing = await mcp.callTool({ name: "cancel", arguments: { sessionId: "never" } });
  assert.match((missing.content as Array<{ text: string }>)[0]?.text ?? "", /"status":"not-found"/);
  release?.();
  await pending;
  const finished = await mcp.callTool({ name: "cancel", arguments: { sessionId: "sess-live" } });
  assert.match((finished.content as Array<{ text: string }>)[0]?.text ?? "", /"status":"not-running"/);
  await mcp.close();
});

test("a Cursor host is refused", async () => {
  const bridge = buildServer({ runTurn: async () => ({ sessionId: "s", result: "no", resumed: false, executor: "cursor", workspace: "/tmp", mode: "agent" }) });
  const client = await connect(bridge.server, "cursor");
  const result = await client.callTool({ name: "delegate", arguments: { prompt: "Do it", workspace: "/tmp/project" } });
  assert.equal(result.isError, true);
  assert.match((result.content as Array<{ text: string }>)[0]?.text ?? "", /cursor-host-recursion/);
  await client.close();
});
