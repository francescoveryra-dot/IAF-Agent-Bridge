import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, unlinkSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runDoctor } from "../doctor.js";
import { log } from "../log.js";
import { runTurn } from "../turn.js";
import type { AgentMode } from "../types.js";
import { BRIDGE_NAME, readPackageVersion } from "../version.js";
import { bearerMatches } from "./auth.js";
import type { ProjectAllowlist } from "./allowlist.js";
import {
  MAX_RESULT_BYTES,
  cancelRequestSchema,
  delegateRequestSchema,
  doctorRequestSchema,
} from "./protocol.js";

const INSTRUCTIONS = `You are the supervisor. This local IAF Agent Bridge only carries the prompt you wrote to Cursor on this computer and returns Cursor's parent-turn result. It does not decide the next step and it does not rewrite the reply.

Call delegate with a projectId the owner already approved. Read the JSON result as if the user pasted Cursor's reply into this conversation. Then choose CONTINUE, COMPLETE, or BLOCKED. On CONTINUE, call delegate again with the same sessionId and a new prompt that you write from that result. Do not send a filesystem path.`;

export interface LocalDelegateInput {
  prompt: string;
  workspace: string;
  sessionId?: string;
  mode: AgentMode;
  model?: string;
  fast: boolean;
  signal: AbortSignal;
}

export interface LocalHandlers {
  delegate(input: LocalDelegateInput): Promise<unknown>;
  doctor(input: { deep: boolean; workspace?: string }): Promise<unknown>;
  cancel(input: { sessionId: string }): Promise<unknown>;
}

export interface LocalMcpOptions {
  allowlist: ProjectAllowlist;
  socketPath?: string;
  port?: number;
  allowLoopbackTcp?: boolean;
  token?: string;
  handlers?: LocalHandlers;
  maxBodyBytes?: number;
  ratePerMinute?: number;
}

export interface LocalMcpServer {
  mcpUrl: string;
  socketPath?: string;
  port?: number;
  close(): Promise<void>;
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

function withoutWorkspace(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy = { ...(value as Record<string, unknown>) };
  delete copy.workspace;
  return copy;
}

function publicDoctor(value: unknown): unknown {
  const report = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const bridge = report.bridge && typeof report.bridge === "object" ? report.bridge as { name?: string; version?: string } : {};
  const cursor = report.cursor && typeof report.cursor === "object" ? report.cursor as { found?: boolean; authenticated?: unknown; version?: string | null } : {};
  return {
    bridge: { name: bridge.name, version: bridge.version },
    cursor: {
      found: cursor.found === true,
      authenticated: cursor.authenticated === true,
      version: typeof cursor.version === "string" ? cursor.version : null,
    },
  };
}

function safeMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/\/\S+/g, "[path]").slice(0, 500);
}

export async function startLocalMcp(options: LocalMcpOptions): Promise<LocalMcpServer> {
  if (!options.socketPath && options.allowLoopbackTcp !== true) {
    throw new Error("Personal Private mode listens on a user-owned socket. TCP loopback requires allowLoopbackTcp.");
  }
  const maxBodyBytes = options.maxBodyBytes ?? 1_000_000;
  const ratePerMinute = options.ratePerMinute ?? 60;
  const hits: number[] = [];
  const controllers = new Map<string, AbortController>();
  const completed = new Map<string, CallToolResult>();
  const activeSessions = new Set<string>();

  function allowRequest(): boolean {
    const now = Date.now();
    while (hits.length > 0 && (hits[0] ?? 0) < now - 60_000) hits.shift();
    if (hits.length >= ratePerMinute) return false;
    hits.push(now);
    return true;
  }

  function release(controller: AbortController, sessionId?: string): void {
    if (sessionId) activeSessions.delete(sessionId);
    for (const [key, active] of controllers) {
      if (active === controller) controllers.delete(key);
    }
  }

  async function runDelegate(args: {
    projectId: string;
    prompt: string;
    sessionId?: string;
    mode: AgentMode;
    model?: string;
    fast: boolean;
    clientRequestId?: string;
  }): Promise<CallToolResult> {
    if (args.clientRequestId) {
      const existing = completed.get(args.clientRequestId);
      if (existing) return existing;
    }
    if (args.sessionId && activeSessions.has(args.sessionId)) {
      return textResult({ error: { reason: "session-busy", message: "That Cursor session already has a parent turn in progress." } }, true);
    }
    const started = Date.now();
    const jobId = randomUUID();
    log("info", `remote.delegate.start job=${jobId} project=${args.projectId}`);
    if (args.sessionId) activeSessions.add(args.sessionId);
    const controller = new AbortController();
    if (args.sessionId) controllers.set(args.sessionId, controller);
    try {
      const workspace = options.allowlist.resolve(args.projectId);
      log("info", `remote.cursor.start job=${jobId} project=${args.projectId}`);
      const raw = options.handlers
        ? await options.handlers.delegate({
          prompt: args.prompt,
          workspace,
          sessionId: args.sessionId,
          mode: args.mode,
          model: args.model,
          fast: args.fast,
          signal: controller.signal,
        })
        : await runTurn({
          prompt: args.prompt,
          workspace,
          sessionId: args.sessionId,
          mode: args.mode,
          model: args.model,
          fast: args.fast,
        }, {
          signal: controller.signal,
          onSession: (sessionId) => controllers.set(sessionId, controller),
        });
      const result = withoutWorkspace(raw);
      if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESULT_BYTES) {
        const failure = textResult({ error: { reason: "oversized-result", message: "Cursor's result exceeded the transport cap and was not forwarded." } }, true);
        if (args.clientRequestId) completed.set(args.clientRequestId, failure);
        return failure;
      }
      const ok = textResult(result);
      if (args.clientRequestId) completed.set(args.clientRequestId, ok);
      log("info", `remote.delegate.done job=${jobId} project=${args.projectId} durationMs=${Date.now() - started}`);
      return ok;
    } catch (err) {
      const message = safeMessage(err);
      const reason = message.includes("not in the local allowlist")
        ? "unknown-project"
        : message.includes("no longer matches")
          ? "workspace-changed"
          : "delegate-failed";
      const failure = textResult({ error: { reason, message } }, true);
      if (args.clientRequestId) completed.set(args.clientRequestId, failure);
      log("info", `remote.delegate.done job=${jobId} project=${args.projectId} ok=false durationMs=${Date.now() - started}`);
      return failure;
    } finally {
      release(controller, args.sessionId);
    }
  }

  const mcp = new McpServer(
    { name: `${BRIDGE_NAME}-chatgpt`, version: readPackageVersion() },
    { instructions: INSTRUCTIONS },
  );
  mcp.registerTool(
    "delegate",
    {
      description: "Send the prompt you wrote to Cursor and wait for that parent turn to finish. Returns Cursor's reply unchanged. You write any follow-up prompt yourself.",
      inputSchema: {
        projectId: delegateRequestSchema.shape.projectId,
        prompt: delegateRequestSchema.shape.prompt,
        sessionId: delegateRequestSchema.shape.sessionId,
        mode: delegateRequestSchema.shape.mode,
        model: delegateRequestSchema.shape.model,
        fast: delegateRequestSchema.shape.fast,
        clientRequestId: delegateRequestSchema.shape.clientRequestId,
      },
      annotations: { title: "Send work to Cursor", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      const parsed = delegateRequestSchema.safeParse(args);
      if (!parsed.success) return textResult({ error: { reason: "invalid-request", message: parsed.error.issues[0]?.message ?? "Invalid delegate request." } }, true);
      return runDelegate(parsed.data);
    },
  );
  mcp.registerTool(
    "doctor",
    {
      description: "Report whether the local bridge can see Cursor. This does not modify a repository and does not return local paths.",
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
      const started = Date.now();
      const jobId = randomUUID();
      log("info", `remote.doctor.start job=${jobId} project=${parsed.data.projectId ?? "-"}`);
      try {
        const workspace = parsed.data.projectId ? options.allowlist.resolve(parsed.data.projectId) : undefined;
        const report = options.handlers
          ? await options.handlers.doctor({ deep: parsed.data.deep, workspace })
          : await runDoctor({ deep: parsed.data.deep, workspace });
        log("info", `remote.doctor.done job=${jobId} durationMs=${Date.now() - started}`);
        return textResult(publicDoctor(report));
      } catch (err) {
        log("info", `remote.doctor.done job=${jobId} ok=false durationMs=${Date.now() - started}`);
        return textResult({ error: { reason: "doctor-failed", message: safeMessage(err) } }, true);
      }
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
      const active = controllers.get(parsed.data.sessionId);
      active?.abort();
      const result = options.handlers
        ? await options.handlers.cancel({ sessionId: parsed.data.sessionId })
        : { cancelled: Boolean(active), sessionId: parsed.data.sessionId };
      return textResult(result);
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
        sendJson(res, 200, { ok: true, telemetry: "none" });
        return;
      }
      if (url.pathname !== "/mcp") {
        sendJson(res, 404, { error: "not-found" });
        return;
      }
      if (options.token && !bearerMatches(req.headers.authorization, options.token)) {
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
    } catch (err) {
      if (res.headersSent) return;
      if (err instanceof PayloadTooLarge) {
        sendJson(res, 413, { error: "payload-too-large" });
        return;
      }
      sendJson(res, 500, { error: "internal" });
    }
  });

  if (options.socketPath) {
    mkdirSync(dirname(options.socketPath), { recursive: true });
    try {
      unlinkSync(options.socketPath);
    } catch {
      // The socket is created on listen.
    }
    await new Promise<void>((resolve, reject) => {
      http.once("error", reject);
      http.listen(options.socketPath, () => resolve());
    });
    chmodSync(options.socketPath, 0o600);
    return {
      mcpUrl: "http://127.0.0.1/mcp",
      socketPath: options.socketPath,
      close: () => new Promise((resolve, reject) => http.close((err) => (err ? reject(err) : resolve()))),
    };
  }

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port ?? 0, "127.0.0.1", () => resolve());
  });
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("The local MCP server did not receive a TCP port.");
  return {
    mcpUrl: `http://127.0.0.1:${address.port}/mcp`,
    port: address.port,
    close: () => new Promise((resolve, reject) => http.close((err) => (err ? reject(err) : resolve()))),
  };
}
