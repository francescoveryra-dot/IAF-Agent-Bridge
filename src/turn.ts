import { isAbsolute, relative, resolve, sep } from "node:path";
import { AcpClient } from "./acp-client.js";
import { discoverProjectContextFiles } from "./context-files.js";
import { loadConfig, type BridgeConfig } from "./config.js";
import { cursorLaunchSpec } from "./discovery.js";
import { BridgeError } from "./errors.js";
import { assertWorkspace } from "./workspace.js";
import type { AgentMode, DelegationResult, SpawnSpec, TodoItem, TodoProgress } from "./types.js";

const RESULT_CAP = 400_000;

export interface TurnInput {
  prompt: string;
  workspace: string;
  sessionId?: string;
  mode?: AgentMode;
  model?: string;
  spawnSpec?: SpawnSpec;
  config?: BridgeConfig;
  handshakeTimeoutMs?: number;
  turnTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export interface TurnHooks {
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  onClient?: (client: AcpClient) => void;
  onSession?: (sessionId: string, client: AcpClient) => void;
}

export async function runTurn(input: TurnInput, hooks: TurnHooks = {}): Promise<DelegationResult> {
  if (process.env.IAF_AGENT_BRIDGE_EXECUTOR === "1") {
    throw new BridgeError(
      "recursive-delegation",
      "Refusing to delegate. This process is already the Cursor agent started by IAF Agent Bridge. Implement the task directly.",
    );
  }
  const config = input.config ?? loadConfig();
  const workspace = assertWorkspace(input.workspace);
  const mode = input.mode ?? "agent";
  const handshakeTimeoutMs = input.handshakeTimeoutMs ?? config.handshakeTimeoutMs;
  const turnTimeoutMs = input.turnTimeoutMs ?? config.turnTimeoutMs;
  const idleTimeoutMs = input.idleTimeoutMs ?? config.idleTimeoutMs;
  const spawnSpec = input.spawnSpec ?? cursorLaunchSpec(config);

  let text = "";
  let sawChunk = false;
  const files = new Set<string>();
  let sessionId = input.sessionId;
  let resumed = false;
  let cancelRequested = false;
  let timedOut: BridgeError | undefined;
  let idleTimer: NodeJS.Timeout | undefined;

  function fail(reason: string, message: string): void {
    if (timedOut) return;
    timedOut = new BridgeError(reason, message, { sessionId, partialResult: text || undefined });
    if (sessionId) client.cancel(sessionId);
    void client.stop();
  }
  function bumpIdle(): void {
    if (!idleTimeoutMs) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => fail("idle-timeout", `Cursor produced no ACP traffic for ${idleTimeoutMs}ms.`), idleTimeoutMs);
  }

  const client = new AcpClient({
    spawnSpec,
    workspace,
    permissionMode: config.permissionMode,
    mode,
    handshakeTimeoutMs,
    onUpdate: (update) => absorbUpdate(update, {
      append: (chunk) => {
        sawChunk = true;
        text = `${text}${chunk}`.slice(-RESULT_CAP);
      },
      appendFull: (chunk) => {
        if (!sawChunk) text = `${text}${chunk}`.slice(-RESULT_CAP);
      },
      addFile: (file) => files.add(file),
    }),
    onActivity: () => bumpIdle(),
  });

  const onAbort = () => {
    cancelRequested = true;
    if (sessionId) client.cancel(sessionId);
    void client.stop();
  };
  hooks.signal?.addEventListener("abort", onAbort);
  const turnTimer = setTimeout(() => fail("turn-timeout", `Cursor did not finish within ${turnTimeoutMs}ms.`), turnTimeoutMs);

  try {
    hooks.onProgress?.("starting Cursor agent");
    hooks.onClient?.(client);
    await client.start();
    await client.initialize();
    await client.authenticate();
    if (input.sessionId) {
      sessionId = await client.loadSession(input.sessionId, workspace);
      resumed = true;
    } else {
      sessionId = await client.newSession(workspace);
    }
    hooks.onSession?.(sessionId, client);
    hooks.onProgress?.(`session ready: ${sessionId}`);
    await client.setMode(sessionId, mode);
    if (input.model) await client.setModel(sessionId, input.model);
    const promptResult = await client.prompt(sessionId, input.prompt, turnTimeoutMs + 5_000);
    if (timedOut) throw timedOut;
    if (hooks.signal?.aborted) cancelRequested = true;
    return buildResult({
      sessionId,
      resumed,
      text,
      mode,
      workspace,
      files,
      client,
      stopReason: promptResult.stopReason,
      requestedModel: input.model,
      cancelRequested,
    });
  } catch (err) {
    if (timedOut) throw timedOut;
    if (err instanceof BridgeError && sessionId && !err.sessionId) {
      throw new BridgeError(err.reason, err.message, { sessionId, partialResult: text || undefined, rpcCode: err.rpcCode });
    }
    throw err;
  } finally {
    clearTimeout(turnTimer);
    clearTimeout(idleTimer);
    hooks.signal?.removeEventListener("abort", onAbort);
    await client.stop();
  }
}

function buildResult(args: {
  sessionId: string;
  resumed: boolean;
  text: string;
  mode: AgentMode;
  workspace: string;
  files: Set<string>;
  client: AcpClient;
  stopReason?: string;
  requestedModel?: string;
  cancelRequested: boolean;
}): DelegationResult {
  const warnings = [...args.client.warnings];
  if (args.client.malformedFrames > 0) warnings.push(`${args.client.malformedFrames} malformed ACP frame(s) were ignored`);
  if (args.text.length >= RESULT_CAP) warnings.push("Cursor's reply was truncated to the result size limit");
  const contextFiles = discoverProjectContextFiles(args.workspace);
  const reported = [...new Set([...args.files].map((file) => relativize(file, args.workspace)).filter((file) => file.length > 0 && file.length < 4_096))];
  const todos = args.client.todos;
  const result: DelegationResult = {
    sessionId: args.sessionId,
    resumed: args.resumed,
    executor: "cursor",
    result: args.text,
    workspace: args.workspace,
    mode: args.mode,
  };
  if (args.stopReason) result.stopReason = args.stopReason;
  if (contextFiles.length) result.projectContextFiles = contextFiles;
  if (reported.length) result.filesReportedByEditTools = reported;
  if (args.client.plan) result.plan = args.client.plan;
  if (todos.length) {
    result.todos = todos;
    result.todoProgress = progress(todos);
  }
  if (args.client.questions.length) result.cursorQuestions = args.client.questions;
  if (args.client.permissionDecisions.length) result.permissionDecisions = args.client.permissionDecisions;
  if (warnings.length) result.protocolWarnings = warnings;
  if (args.cancelRequested) result.cancelRequested = true;
  if (args.client.currentModelId && args.requestedModel && args.client.currentModelId !== args.requestedModel) {
    result.effectiveModel = args.client.currentModelId;
  }
  return result;
}

function progress(todos: TodoItem[]): TodoProgress {
  const count = (status: TodoItem["status"]) => todos.filter((todo) => todo.status === status).length;
  return {
    total: todos.length,
    completed: count("completed"),
    inProgress: count("in_progress"),
    pending: count("pending"),
    cancelled: count("cancelled"),
  };
}

function relativize(file: string, workspace: string): string {
  const abs = resolve(workspace, file);
  const rel = relative(workspace, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return file.replaceAll("\\", "/");
  return rel.split(sep).join("/");
}

function absorbUpdate(update: unknown, sink: {
  append: (chunk: string) => void;
  appendFull: (chunk: string) => void;
  addFile: (file: string) => void;
}): void {
  const body = update && typeof update === "object" ? (update as Record<string, unknown>) : null;
  if (!body) return;
  const contentText = textOf(body.content);
  if (body.sessionUpdate === "agent_message_chunk" && contentText) sink.append(contentText);
  else if (body.sessionUpdate === "agent_message" && contentText) sink.appendFull(contentText);
  collectPaths(body, sink.addFile);
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => textOf(item)).join("");
  if (!content || typeof content !== "object") return "";
  const record = content as Record<string, unknown>;
  if (record.type === "image") return "";
  return typeof record.text === "string" ? record.text : "";
}

function collectPaths(body: Record<string, unknown>, add: (file: string) => void): void {
  if (Array.isArray(body.locations)) {
    for (const location of body.locations) {
      if (location && typeof location === "object" && typeof (location as { path?: unknown }).path === "string") {
        add((location as { path: string }).path);
      }
    }
  }
  if (Array.isArray(body.content)) {
    for (const block of body.content) {
      if (!block || typeof block !== "object") continue;
      const entry = block as { type?: unknown; path?: unknown };
      if (entry.type === "diff" && typeof entry.path === "string") add(entry.path);
    }
  }
  if (body.rawInput && typeof body.rawInput === "object") {
    const raw = body.rawInput as Record<string, unknown>;
    for (const key of ["path", "filePath", "file_path", "target_file"]) {
      if (typeof raw[key] === "string") add(raw[key]);
    }
  }
}
