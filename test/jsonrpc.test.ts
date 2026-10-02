import assert from "node:assert/strict";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { JsonRpcPeer } from "../dist/jsonrpc.js";

function pair() {
  const input = new PassThrough();
  const output = new PassThrough();
  const requests: Array<{ id: unknown; method: string; params: unknown }> = [];
  const peer = new JsonRpcPeer(input, output, {
    onRequest: (id, method, params) => requests.push({ id, method, params }),
    onNotification: () => {},
  });
  return { input, output, peer, requests };
}

test("responses resolve the matching request", async () => {
  const { input, output, peer } = pair();
  const pending = peer.request("initialize", { protocolVersion: 1 }, 1000);
  const raw = (await once(output, "data"))[0].toString();
  const sent = JSON.parse(raw) as { id: number };
  input.write(`${JSON.stringify({ jsonrpc: "2.0", id: sent.id, result: { ok: true } })}\n`);
  assert.deepEqual(await pending, { ok: true });
  peer.close();
});

test("malformed frames are counted and the next frame still works", async () => {
  const { input, output, peer } = pair();
  const pending = peer.request("authenticate", {}, 1000);
  await once(output, "data");
  input.write("not-json\n");
  input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ready: true } })}\n`);
  assert.deepEqual(await pending, { ready: true });
  assert.equal(peer.malformedFrames, 1);
  peer.close();
});

test("incoming requests are dispatched", async () => {
  const { input, peer, requests } = pair();
  input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 9, method: "session/request_permission", params: { options: [] } })}\n`);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests[0]?.method, "session/request_permission");
  assert.equal(requests[0]?.id, 9);
  peer.close();
});

test("an RPC error rejects with the agent message", async () => {
  const { input, output, peer } = pair();
  const pending = peer.request("session/load", { sessionId: "missing" }, 1000);
  const raw = (await once(output, "data"))[0].toString();
  const sent = JSON.parse(raw) as { id: number };
  input.write(`${JSON.stringify({ jsonrpc: "2.0", id: sent.id, error: { code: -32002, message: "session not found" } })}\n`);
  await assert.rejects(pending, /session not found/);
  peer.close();
});
