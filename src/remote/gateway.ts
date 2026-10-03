import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { log } from "../log.js";
import { BRIDGE_NAME, readPackageVersion } from "../version.js";
import { bearerMatches } from "./auth.js";
import {
  cancelRequestSchema,
  delegateRequestSchema,
  doctorRequestSchema,
  MAX_RESULT_BYTES,
  REMOTE_PROTOCOL,
  remoteResultSchema,
  type RemoteError,
  type RemoteJob,
} from "./protocol.js";

const INSTRUCTIONS = `You are the supervisor. IAF Agent Bridge Remote only carries a prompt to Cursor on the owner's Mac and returns Cursor's parent-turn result. It does not decide the next step and it does not rewrite Cursor's reply.

Call delegate with a projectId from the owner's allowlist and the prompt you wrote. Read the JSON result as if the user pasted Cursor's reply into this conversation. Then choose CONTINUE, COMPLETE, or BLOCKED. On CONTINUE, call delegate again with the same sessionId and a new prompt that you write from that result. Do not shell out to Cursor. Do not send a filesystem path.`;

export interface GatewayOptions {
  chatToken: string;
  connectorToken: string;
  host?: string;
  port?: number;
  offlineTimeoutMs?: number;
  resultTimeoutMs?: number;
  leaseMs?: number;
  pollWaitMs?: number;
  maxBodyBytes?: number;
  maxResultBytes?: number;
  ratePerMinute?: number;
}

export interface GatewayServer {
  url: string;
  mcpUrl: string;
  port: number;
  close(): Promise<void>;
}

interface StoredJob {
  job: RemoteJob;
  state: "queued" | "leased" | "done" | "failed";
  result?: unknown;
  error?: RemoteError;
  sessionId?: string;
  promise: Promise<void>;
  finish(error?: RemoteError, result?: unknown): void;
}

class PayloadTooLarge extends Error {}

function textResult(value: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
    ...(isError ? { isError: true } : {}),
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const encoded = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(encoded.length),
    "cache-control": "no-store",
  });
  res.end(encoded);
}

async function readLimited(req: IncomingMessage, max: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  let overflow = false;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 2_000_000) {
      req.destroy();
      throw new PayloadTooLarge();
    }
    if (total > max) overflow = true;
    else chunks.push(buffer);
  }
  if (overflow) throw new PayloadTooLarge();
  return Buffer.concat(chunks);
}

export async function startGateway(options: GatewayOptions): Promise<GatewayServer> {
  if (!options.chatToken || !options.connectorToken || options.chatToken === options.connectorToken) {
    throw new Error("The ChatGPT token and the connector token must both be set and must differ.");
  }
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("The proof-of-concept gateway binds only to loopback. Do not expose it publicly from this command.");
  }
  const offlineTimeoutMs = options.offlineTimeoutMs ?? 5_000;
  const resultTimeoutMs = options.resultTimeoutMs ?? 15 * 60_000;
  const leaseMs = options.leaseMs ?? 60_000;
  const pollWaitMs = options.pollWaitMs ?? 15_000;
  const maxBodyBytes = options.maxBodyBytes ?? 1_000_000;
  const maxResultBytes = options.maxResultBytes ?? MAX_RESULT_BYTES;
  const ratePerMinute = options.ratePerMinute ?? 60;
  const hits: number[] = [];
  const jobs = new Map<string, StoredJob>();
  const byRequest = new Map<string, StoredJob>();
  const activeSessions = new Map<string, string>();
  let lastPollAt = 0;
  let waiter: ((job: RemoteJob | null) => void) | undefined;

  function allowRequest(): boolean {
    const now = Date.now();
    while (hits.length > 0 && (hits[0] ?? 0) < now - 60_000) hits.shift();
    if (hits.length >= ratePerMinute) return false;
    hits.push(now);
    return true;
  }

  function leaseNext(): RemoteJob | null {
    for (const stored of jobs.values()) {
      if (stored.state !== "queued") continue;
      stored.state = "leased";
      return stored.job;
    }
    return null;
  }

  function notify(): void {
    if (!waiter) return;
    const job = leaseNext();
    if (!job) return;
    const pending = waiter;
    waiter = undefined;
    pending(job);
  }

  function createJob(job: RemoteJob, sessionId?: string): StoredJob {
    let finish: StoredJob["finish"] = () => undefined;
    const promise = new Promise<void>((resolve) => {
      finish = (error?: RemoteError, result?: unknown) => {
        const stored = jobs.get(job.id);
        if (!stored || stored.state === "done" || stored.state === "failed") {
          resolve();
          return;
        }
        stored.error = error;
        stored.result = result;
        stored.state = error ? "failed" : "done";
        if (stored.sessionId) activeSessions.delete(stored.sessionId);
        resolve();
      };
    });
    const stored: StoredJob = { job, state: "queued", sessionId, promise, finish };
    jobs.set(job.id, stored);
    byRequest.set(job.requestId, stored);
    if (sessionId) activeSessions.set(sessionId, job.id);
    notify();
    const offline = setTimeout(() => {
      if (stored.state === "queued") stored.finish({ reason: "connector-offline", message: "The local connector is not connected." });
    }, offlineTimeoutMs);
    const overall = setTimeout(() => {
      if (stored.state !== "done" && stored.state !== "failed") {
        stored.finish({ reason: "timeout", message: "The local Cursor turn did not finish before the gateway deadline." });
      }
    }, resultTimeoutMs);
    void stored.promise.finally(() => {
      clearTimeout(offline);
      clearTimeout(overall);
    });
    return stored;
  }

  async function settle(stored: StoredJob): Promise<CallToolResult> {
    await stored.promise;
    if (stored.error) return textResult({ error: stored.error }, true);
    return textResult(stored.result);
  }

  async function enqueue(
    kind: RemoteJob["kind"],
    request: { clientRequestId?: string; sessionId?: string },
    fields: Omit<RemoteJob, "protocol" | "id" | "requestId" | "kind">,
  ): Promise<CallToolResult> {
    if (request.clientRequestId) {
      const existing = byRequest.get(request.clientRequestId);
      if (existing) return settle(existing);
    }
    if (kind === "delegate" && request.sessionId && activeSessions.has(request.sessionId)) {
      return textResult({ error: { reason: "session-busy", message: "That Cursor session already has a parent turn in progress." } }, true);
    }
    const job: RemoteJob = {
      protocol: REMOTE_PROTOCOL,
      id: randomUUID(),
      requestId: request.clientRequestId ?? randomUUID(),
      kind,
      ...fields,
    };
    log("info", `remote.${kind} job=${job.id} project=${fields.projectId ?? "-"}`);
    return settle(createJob(job, kind === "delegate" ? request.sessionId : undefined));
  }

  const mcp = new McpServer(
    { name: `${BRIDGE_NAME}-remote`, version: readPackageVersion() },
    { instructions: INSTRUCTIONS },
  );

  mcp.registerTool(
    "delegate",
    {
      description: "Send the prompt you wrote to Cursor through the local connector and wait for that parent turn to finish. Returns Cursor's reply unchanged. You write any follow-up prompt yourself.",
      inputSchema: {
        projectId: delegateRequestSchema.shape.projectId,
        prompt: delegateRequestSchema.shape.prompt,
        sessionId: delegateRequestSchema.shape.sessionId,
        mode: delegateRequestSchema.shape.mode,
        model: delegateRequestSchema.shape.model,
        fast: delegateRequestSchema.shape.fast,
        clientRequestId: delegateRequestSchema.shape.clientRequestId,
      },
      annotations: { title: "Send work to Cursor", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      const parsed = delegateRequestSchema.safeParse(args);
      if (!parsed.success) return textResult({ error: { reason: "invalid-request", message: parsed.error.issues[0]?.message ?? "Invalid delegate request." } }, true);
      return enqueue("delegate", parsed.data, {
        projectId: parsed.data.projectId,
        prompt: parsed.data.prompt,
        sessionId: parsed.data.sessionId,
        mode: parsed.data.mode,
        model: parsed.data.model,
        fast: parsed.data.fast,
      });
    },
  );

  mcp.registerTool(
    "doctor",
    {
      description: "Ask the local connector for the bridge and Cursor status. This does not modify a repository.",
      inputSchema: {
        projectId: doctorRequestSchema.shape.projectId,
        deep: doctorRequestSchema.shape.deep,
        clientRequestId: doctorRequestSchema.shape.clientRequestId,
      },
      annotations: { title: "Check the local bridge", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const parsed = doctorRequestSchema.safeParse(args);
      if (!parsed.success) return textResult({ error: { reason: "invalid-request", message: parsed.error.issues[0]?.message ?? "Invalid doctor request." } }, true);
      return enqueue("doctor", parsed.data, { projectId: parsed.data.projectId, deep: parsed.data.deep });
    },
  );

  mcp.registerTool(
    "cancel",
    {
      description: "Cancel the in-flight Cursor parent turn for a sessionId returned by delegate.",
      inputSchema: {
        sessionId: cancelRequestSchema.shape.sessionId,
        clientRequestId: cancelRequestSchema.shape.clientRequestId,
      },
      annotations: { title: "Cancel a Cursor turn", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const parsed = cancelRequestSchema.safeParse(args);
      if (!parsed.success) return textResult({ error: { reason: "invalid-request", message: parsed.error.issues[0]?.message ?? "Invalid cancel request." } }, true);
      return enqueue("cancel", parsed.data, { sessionId: parsed.data.sessionId });
    },
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  });
  await mcp.connect(transport);

  const http = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/healthz") {
        sendJson(res, 200, { ok: true, connectorReady: Date.now() - lastPollAt < pollWaitMs + leaseMs });
        return;
      }
      if (url.pathname === "/mcp") {
        if (!bearerMatches(req.headers.authorization, options.chatToken)) {
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        if (req.method === "POST" && !allowRequest()) {
          sendJson(res, 429, { error: "rate-limited" });
          return;
        }
        if (req.method === "POST") {
          const body = await readLimited(req, maxBodyBytes);
          let parsed: unknown;
          try {
            parsed = JSON.parse(body.toString("utf8"));
          } catch {
            sendJson(res, 400, { error: "malformed-json" });
            return;
          }
          await transport.handleRequest(req, res, parsed);
          return;
        }
        await transport.handleRequest(req, res);
        return;
      }
      if (!bearerMatches(req.headers.authorization, options.connectorToken)) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }
      if (req.method === "POST" && url.pathname === "/connector/poll") {
        lastPollAt = Date.now();
        const immediate = leaseNext();
        if (immediate) {
          sendJson(res, 200, { protocol: REMOTE_PROTOCOL, job: immediate });
          return;
        }
        const job = await new Promise<RemoteJob | null>((resolve) => {
          const timer = setTimeout(() => {
            waiter = undefined;
            resolve(leaseNext());
          }, pollWaitMs);
          waiter = (value) => {
            clearTimeout(timer);
            resolve(value);
          };
        });
        sendJson(res, 200, { protocol: REMOTE_PROTOCOL, job });
        return;
      }
      if (req.method === "POST" && url.pathname === "/connector/result") {
        const body = await readLimited(req, maxResultBytes);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body.toString("utf8"));
        } catch {
          sendJson(res, 400, { error: "malformed-json" });
          return;
        }
        const result = remoteResultSchema.safeParse(parsed);
        if (!result.success) {
          sendJson(res, 400, { error: "malformed-message" });
          return;
        }
        const stored = jobs.get(result.data.id);
        if (!stored) {
          sendJson(res, 404, { error: "unknown-job" });
          return;
        }
        if (stored.state === "done" || stored.state === "failed") {
          sendJson(res, 200, { ok: true, duplicate: true });
          return;
        }
        if (result.data.ok) stored.finish(undefined, result.data.result);
        else stored.finish(result.data.error ?? { reason: "connector-error", message: "The connector failed without a reason." });
        log("info", `remote.result job=${stored.job.id} ok=${String(result.data.ok)}`);
        sendJson(res, 200, { ok: true });
        return;
      }
      sendJson(res, 404, { error: "not-found" });
    } catch (err) {
      if (res.headersSent) return;
      if (err instanceof PayloadTooLarge) {
        sendJson(res, 413, { error: "payload-too-large" });
        return;
      }
      sendJson(res, 500, { error: "internal" });
    }
  });

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port ?? 0, host, () => resolve());
  });
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("The gateway did not receive a TCP port.");
  const url = `http://${host}:${address.port}`;
  return {
    url,
    mcpUrl: `${url}/mcp`,
    port: address.port,
    close: () => new Promise((resolve, reject) => {
      waiter?.(null);
      http.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}
