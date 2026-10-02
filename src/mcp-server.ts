import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AcpClient } from "./acp-client.js";
import { formatTurnError } from "./errors.js";
import { resolveExecutor } from "./executor.js";
import type { DoctorOptions } from "./doctor.js";
import type { TurnHooks, TurnInput } from "./turn.js";
import { BRIDGE_NAME, readPackageVersion } from "./version.js";

export const SERVER_INSTRUCTIONS = `IAF Agent Bridge carries work to Cursor Agent over ACP. You are the supervisor. The bridge is not a reviewer and does not implement the software itself.

Call delegate with a natural prompt. Read the JSON result as if the user pasted Cursor's reply into this conversation. Then choose CONTINUE, COMPLETE, or BLOCKED. CONTINUE is the default whenever requested work remains and Cursor can reasonably do it. Plans, TODOs, mocks, missing layers, and "next steps" inside the original request are CONTINUE. On CONTINUE, call delegate again with the same sessionId and a contextual follow-up. Do not open a fresh session for ordinary follow-up.

COMPLETE only when the requested scope is substantively done. BLOCKED only for a genuine external decision, secret, or irreversible authorization. Do not invent secrets, and do not mock an integration because a secret is missing.

Do not demand a fresh end-to-end suite, lint pass, or coverage gate after every turn unless this task actually needs that check. If project context files are listed, tell Cursor to read them on the first turn and do not paste them again. If none exist, the prompt and this conversation are enough. Do not create Master Prompt or traceability files unless the work needs them.

If you are Cursor, do not call delegate. Nested delegation is refused. Ordinary development permissions are resolved automatically. Force push, history rewrite, production data destruction, and secret publication are rejected and reported.`;

const delegateInput = {
  prompt: z.string().trim().min(1).max(200_000).describe("Natural prompt for Cursor. Sent as written. Point at files and project documents instead of pasting them."),
  workspace: z.string().trim().min(1).describe("Existing project directory Cursor will work in. Must not be the home directory or filesystem root."),
  sessionId: z.string().trim().min(1).optional().describe("Resume this Cursor session. Omit to start one. Use the sessionId from the previous result for follow-up work."),
  mode: z.enum(["agent", "plan", "ask"]).default("agent").describe("agent implements. plan asks Cursor to produce a plan and stop. ask is for a read-oriented question. The mode is an instruction to Cursor."),
  model: z.string().trim().min(1).max(200).optional().describe("Optional Cursor model id. Omit to keep Cursor's current default."),
  fast: z.boolean().default(false).describe("Request Cursor's fast tier. Leave false unless the user asks. Higher cost."),
  effort: z.string().trim().min(1).optional().describe("Exact effort value advertised by the selected model. Invalid values fail before the prompt and name the accepted set."),
  context: z.string().trim().min(1).optional().describe("Context-window option when the model advertises one, such as 272k or 1m. Omit unless the user asks."),
  contextFiles: z.array(z.string().trim().min(1)).max(20).optional().describe("Files to attach. Text becomes resource links. Images (png, jpg, gif, webp, under 5MB) are sent inline when Cursor accepts them. Missing files are warnings, not failures."),
};

const doctorInput = {
  deep: z.boolean().default(false).describe("Open a short ACP session to verify Cursor can start. This creates an empty Cursor session."),
  workspace: z.string().trim().min(1).optional().describe("Optional project directory to validate and scan for project context files."),
};

const cancelInput = {
  sessionId: z.string().trim().min(1).describe("Session id returned by delegate."),
  force: z.boolean().default(false).describe("After a short grace period, kill the Cursor process if the turn is still running."),
};

interface Handle {
  client: AcpClient;
  cancelRequested: boolean;
}

export interface ServerDeps {
  runTurn?: (input: TurnInput, hooks?: TurnHooks) => Promise<unknown>;
  runDoctor?: (options?: DoctorOptions) => Promise<Record<string, unknown>>;
  forceGraceMs?: number;
}

export interface BridgeServer {
  server: McpServer;
  inFlight: Map<string, Set<Handle>>;
  pending: Set<Handle>;
  seenSessions: Set<string>;
}

function textResult(value: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
    ...(isError ? { isError: true } : {}),
  };
}

function remember(set: Set<string>, id: string): void {
  if (set.has(id)) set.delete(id);
  set.add(id);
  if (set.size > 500) {
    const oldest = set.values().next().value;
    if (oldest) set.delete(oldest);
  }
}

function hostBlocksDelegation(name: string | undefined): string | undefined {
  if (process.env.IAF_AGENT_BRIDGE_EXECUTOR === "1") {
    return "delegate failed [recursive-delegation]: Refusing to delegate from inside the Cursor agent this bridge started. Implement the task directly.";
  }
  if (name && /cursor/i.test(name)) {
    return "delegate failed [cursor-host-recursion]: This MCP client is Cursor. Do not delegate from Cursor back into Cursor. Implement the task directly.";
  }
  return undefined;
}

export function buildServer(deps: ServerDeps = {}): BridgeServer {
  const executor = resolveExecutor("cursor");
  const runTurn = deps.runTurn ?? ((input: TurnInput, hooks?: TurnHooks) => executor.run(input, hooks));
  const diagnose = deps.runDoctor ?? ((options?: DoctorOptions) => executor.diagnose(options));
  const forceGraceMs = deps.forceGraceMs ?? 5_000;
  const inFlight = new Map<string, Set<Handle>>();
  const pending = new Set<Handle>();
  const seenSessions = new Set<string>();
  const server = new McpServer(
    { name: BRIDGE_NAME, version: readPackageVersion() },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "delegate",
    {
      description: "Send a prompt to Cursor Agent, or continue an existing Cursor session. Returns Cursor's reply and the sessionId to reuse. You decide CONTINUE, COMPLETE, or BLOCKED. Do not shell out to the agent binary.",
      inputSchema: delegateInput,
      annotations: {
        title: "Send work to Cursor",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const blocked = hostBlocksDelegation(server.server.getClientVersion()?.name);
      if (blocked) return textResult(blocked, true);
      let handle: Handle | undefined;
      let activeSession: string | undefined;
      const progressToken = extra._meta?.progressToken;
      let progress = 0;
      const onProgress = (message: string) => {
        if (progressToken === undefined) return;
        progress += 1;
        void extra.sendNotification({
          method: "notifications/progress",
          params: { progressToken, progress, message: message.slice(0, 200) },
        }).catch(() => {});
      };
      try {
        const out = await runTurn({
          prompt: args.prompt,
          workspace: args.workspace,
          sessionId: args.sessionId,
          mode: args.mode,
          model: args.model,
          fast: args.fast,
          effort: args.effort,
          context: args.context,
          contextFiles: args.contextFiles,
        }, {
          signal: extra.signal,
          onProgress,
          onClient: (client) => {
            handle = { client, cancelRequested: false };
            pending.add(handle);
          },
          onSession: (sessionId, client) => {
            activeSession = sessionId;
            handle ??= { client, cancelRequested: false };
            pending.delete(handle);
            const handles = inFlight.get(sessionId) ?? new Set<Handle>();
            handles.add(handle);
            inFlight.set(sessionId, handles);
            remember(seenSessions, sessionId);
          },
        });
        if (handle?.cancelRequested && out && typeof out === "object") {
          (out as { cancelRequested?: boolean }).cancelRequested = true;
        }
        return textResult(out);
      } catch (err) {
        return textResult(formatTurnError(err), true);
      } finally {
        if (handle) pending.delete(handle);
        if (activeSession && handle) {
          const handles = inFlight.get(activeSession);
          handles?.delete(handle);
          if (handles && handles.size === 0) inFlight.delete(activeSession);
        }
      }
    },
  );

  server.registerTool(
    "cancel",
    {
      description: "Cancel an in-flight Cursor turn by sessionId. Status is cancelled, killed, not-running (the turn ended and the session can still be resumed), or not-found.",
      inputSchema: cancelInput,
      annotations: {
        title: "Cancel Cursor turn",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sessionId, force }) => {
      const handles = inFlight.get(sessionId);
      if (!handles || handles.size === 0) {
        return textResult({ status: seenSessions.has(sessionId) ? "not-running" : "not-found", sessionId });
      }
      for (const item of handles) {
        item.cancelRequested = true;
        item.client.cancel(sessionId);
      }
      if (!force) return textResult({ status: "cancelled", sessionId });
      await new Promise((resolve) => setTimeout(resolve, forceGraceMs));
      const still = inFlight.get(sessionId);
      if (!still || still.size === 0) return textResult({ status: "cancelled", sessionId });
      const targets = [...still];
      const stopped = await Promise.all(targets.map(async (item) => {
        try {
          return await item.client.stop();
        } catch {
          return false;
        }
      }));
      if (!stopped.every(Boolean)) return textResult({ status: "cancelled", sessionId });
      for (const item of targets) still.delete(item);
      if (still.size === 0) inFlight.delete(sessionId);
      return textResult({ status: "killed", sessionId });
    },
  );

  server.registerTool(
    "doctor",
    {
      description: "Report Node, bridge version, Cursor CLI discovery, authentication state without secrets, and an optional ACP handshake.",
      inputSchema: doctorInput,
      annotations: {
        title: "Diagnose IAF Agent Bridge",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ deep, workspace }) => {
      const version = server.server.getClientVersion();
      const report = await diagnose({
        deep,
        workspace,
        clientInfo: {
          name: version?.name,
          version: version?.version,
          capabilities: server.server.getClientCapabilities() as Record<string, unknown> | undefined,
        },
      });
      return textResult(report);
    },
  );

  return { server, inFlight, pending, seenSessions };
}

export function installSignalCleanup(
  inFlight: Map<string, Set<Handle>>,
  pending: Set<Handle>,
  exit: (code: number) => void = (code) => process.exit(code),
): void {
  let stopping = false;
  const shutdown = (code: number) => {
    if (stopping) {
      exit(code);
      return;
    }
    stopping = true;
    process.exitCode = code;
    const stops: Array<Promise<unknown>> = [];
    const dispatch = (handle: Handle) => {
      stops.push(Promise.resolve(handle.client.stop()).catch(() => false));
    };
    for (const handles of inFlight.values()) for (const handle of handles) dispatch(handle);
    for (const handle of pending) dispatch(handle);
    void Promise.all(stops).finally(() => exit(code));
  };
  process.on("SIGINT", () => shutdown(130));
  process.on("SIGTERM", () => shutdown(143));
  process.stdin.on("end", () => shutdown(0));
}
