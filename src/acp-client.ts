import { spawn, type ChildProcess } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { BridgeError } from "./errors.js";
import { log } from "./log.js";
import { redact } from "./redact.js";
import { JsonRpcPeer, type JsonRpcId } from "./jsonrpc.js";
import type { PromptBlock } from "./attachments.js";
import { asConfigOptions, type ConfigOption } from "./model-config.js";
import { decidePermission } from "./permissions.js";
import { forceKillProcessTree, killProcessTree, waitForExit } from "./process-tree.js";
import { BRIDGE_NAME, readPackageVersion } from "./version.js";
import type {
  AgentMode,
  CapturedPlan,
  CursorQuestion,
  PermissionDecision,
  PermissionMode,
  SpawnSpec,
  TodoItem,
} from "./types.js";

const STDERR_CAP = 64 * 1024;

export interface AcpClientOptions {
  spawnSpec: SpawnSpec;
  workspace: string;
  permissionMode: PermissionMode;
  mode: AgentMode;
  handshakeTimeoutMs: number;
  onUpdate?: (update: unknown) => void;
  onActivity?: () => void;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function methodNotFound(err: unknown): boolean {
  return err instanceof BridgeError && err.rpcCode === -32601;
}

export class AcpClient {
  readonly warnings: string[] = [];
  readonly permissionDecisions: PermissionDecision[] = [];
  readonly questions: CursorQuestion[] = [];
  plan: CapturedPlan | undefined;
  todos: TodoItem[] = [];
  protocolVersion: unknown;
  agentCapabilities: unknown;
  currentModelId: string | undefined;
  configOptions: ConfigOption[] = [];
  availableModels: string[] = [];
  availableModes: string[] = [];
  imagesAccepted = false;
  sessionTitle: string | undefined;
  private child?: ChildProcess;
  private peer?: JsonRpcPeer;
  private spawnError?: BridgeError;
  private stderr = "";
  private stderrDecoder = new StringDecoder("utf8");
  private exitSeen = false;
  private stopping: Promise<boolean> | null = null;

  constructor(private readonly options: AcpClientOptions) {}

  get stderrTail(): string {
    return redact(this.stderr).slice(-4_000);
  }

  get malformedFrames(): number {
    return this.peer?.malformedFrames ?? 0;
  }

  async start(): Promise<void> {
    const { command, args, env } = this.options.spawnSpec;
    const child = spawn(command, args, {
      cwd: this.options.workspace,
      env: { ...process.env, ...env, IAF_AGENT_BRIDGE_EXECUTOR: "1" },
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    child.on("error", (err) => {
      const message = err instanceof Error ? err.message : String(err);
      const failure = new BridgeError("spawn-failed", `Cursor agent failed to start: ${message}`);
      if (this.peer) this.peer.rejectAll(failure);
      else this.spawnError = failure;
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      this.stderr = (this.stderr + this.stderrDecoder.write(chunk)).slice(-STDERR_CAP);
    });
    child.stderr?.on("error", () => {});
    child.stdin?.on("error", () => {});
    child.stdout?.on("error", () => {});
    const failExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (this.exitSeen) return;
      this.exitSeen = true;
      const detail = this.stderrTail;
      this.peer?.rejectAll(new BridgeError(
        "agent-exit",
        `Cursor agent exited (code=${code}${signal ? `, signal=${signal}` : ""})${detail ? `: ${detail}` : ""}`,
      ));
    };
    child.once("exit", failExit);
    child.once("close", failExit);
    if (!child.stdout || !child.stdin) {
      throw new BridgeError("spawn-failed", "Cursor agent pipes were not available.");
    }
    this.peer = new JsonRpcPeer(child.stdout, child.stdin, {
      onRequest: (id, method, params) => {
        void this.dispatch(id, method, params);
      },
      onNotification: (method, params) => {
        if (method === "session/update") {
          this.options.onUpdate?.(record(params)?.update ?? params);
          return;
        }
        void this.dispatch(undefined, method, params);
      },
      onActivity: () => this.options.onActivity?.(),
      onMalformed: (detail) => this.warnings.push(detail),
    });
    if (this.spawnError) throw this.spawnError;
    await new Promise<void>((resolve, reject) => {
      child.once("error", (err) => {
        reject(new BridgeError(
          "spawn-failed",
          `Could not start Cursor agent (${command}): ${err.message}. Install the Cursor CLI and run \`agent login\`. https://cursor.com/docs/cli/overview`,
        ));
      });
      child.once("spawn", () => resolve());
    });
  }

  async initialize(): Promise<void> {
    const result = record(await this.rpc("initialize", {
      protocolVersion: 1,
      clientInfo: { name: BRIDGE_NAME, version: readPackageVersion() },
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    }));
    this.protocolVersion = result?.protocolVersion;
    this.agentCapabilities = result?.agentCapabilities;
    const capabilities = record(result?.agentCapabilities);
    this.imagesAccepted = record(capabilities?.promptCapabilities)?.image === true;
  }

  async authenticate(): Promise<void> {
    try {
      await this.rpc("authenticate", { methodId: "cursor_login" });
    } catch (err) {
      if (methodNotFound(err)) {
        this.warnings.push("authenticate is not implemented by this agent; continuing with the existing login");
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new BridgeError("auth-required", `Cursor authentication failed: ${message}. Run \`agent login\` and try again.`);
    }
  }

  async newSession(cwd: string): Promise<string> {
    return this.captureSession(await this.rpc("session/new", { cwd, mcpServers: [] }));
  }

  async loadSession(sessionId: string, cwd: string): Promise<string> {
    const params = { sessionId, cwd, mcpServers: [] };
    try {
      return this.captureSession(await this.rpc("session/load", params), sessionId);
    } catch (err) {
      if (!methodNotFound(err)) {
        const message = err instanceof Error ? err.message : String(err);
        throw new BridgeError(
          "session-not-found",
          `Could not resume Cursor session ${sessionId}: ${message}. Start a new session and restate the context that turn still needs.`,
          { sessionId },
        );
      }
      this.warnings.push("session/load is unavailable; tried session/resume");
      try {
        return this.captureSession(await this.rpc("session/resume", params), sessionId);
      } catch (resumeErr) {
        const message = resumeErr instanceof Error ? resumeErr.message : String(resumeErr);
        throw new BridgeError("session-not-found", `Could not resume Cursor session ${sessionId}: ${message}.`, { sessionId });
      }
    }
  }

  async setMode(sessionId: string, mode: AgentMode): Promise<void> {
    try {
      await this.rpc("session/set_mode", { sessionId, modeId: mode });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.warnings.push(methodNotFound(err)
        ? `session/set_mode is unavailable; ${mode} was requested as an instruction`
        : `session/set_mode failed: ${message}`);
    }
  }

  async setModel(sessionId: string, modelId: string): Promise<void> {
    try {
      const result = record(await this.rpc("session/set_model", { sessionId, modelId }));
      const current = result?.currentModelId ?? result?.modelId;
      if (typeof current === "string") this.currentModelId = current;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BridgeError("invalid-model", `Cursor rejected model "${modelId}": ${message}`);
    }
  }

  async setConfigOption(sessionId: string, configId: string, value: string): Promise<void> {
    try {
      const result = record(await this.rpc("session/set_config_option", { sessionId, configId, value }));
      const options = asConfigOptions(result?.configOptions);
      if (options.length) this.configOptions = options;
      if (typeof result?.currentModelId === "string") this.currentModelId = result.currentModelId;
    } catch (err) {
      if (methodNotFound(err)) {
        this.warnings.push(`session/set_config_option is unavailable; ${configId} was not applied`);
        return;
      }
      throw err;
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    try {
      await this.rpc("session/close", { sessionId });
    } catch (err) {
      if (!methodNotFound(err)) {
        const message = err instanceof Error ? err.message : String(err);
        this.warnings.push(`session/close failed: ${message}`);
      }
    }
  }

  async prompt(sessionId: string, blocks: PromptBlock[], timeoutMs: number): Promise<{ stopReason?: string }> {
    const result = record(await this.rpc("session/prompt", {
      sessionId,
      prompt: blocks,
    }, timeoutMs));
    const stopReason = result?.stopReason;
    if (typeof stopReason !== "string") {
      if (stopReason !== undefined) this.warnings.push("stopReason was not a string and was omitted");
      return {};
    }
    return { stopReason };
  }

  cancel(sessionId: string): void {
    try {
      this.peer?.notify("session/cancel", { sessionId });
    } catch (err) {
      log("debug", `session/cancel failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async stop(): Promise<boolean> {
    if (!this.stopping) this.stopping = this.teardown();
    return this.stopping;
  }

  private async teardown(): Promise<boolean> {
    const child = this.child;
    if (!child?.pid) {
      this.peer?.close();
      return true;
    }
    killProcessTree(child.pid);
    let exited = await waitForExit(child, 2_000);
    if (!exited) {
      forceKillProcessTree(child.pid);
      exited = await waitForExit(child, 1_000);
    }
    this.peer?.close();
    return exited;
  }

  private rpc(method: string, params: unknown, timeoutMs = this.options.handshakeTimeoutMs): Promise<unknown> {
    if (!this.peer) return Promise.reject(new BridgeError("spawn-failed", "Cursor agent is not running."));
    return this.peer.request(method, params, timeoutMs);
  }

  private captureSession(result: unknown, fallbackId?: string): string {
    const body = record(result);
    const returned = body?.sessionId;
    const sessionId = typeof returned === "string" && returned ? returned : fallbackId;
    if (!sessionId) {
      throw new BridgeError("protocol", "Cursor did not return a session id.");
    }
    const models = record(body?.models);
    if (typeof models?.currentModelId === "string") this.currentModelId = models.currentModelId;
    if (Array.isArray(models?.availableModels)) {
      this.availableModels = models.availableModels.flatMap((item) => {
        const model = record(item);
        return typeof model?.modelId === "string" ? [model.modelId] : [];
      });
    }
    const modes = record(body?.modes);
    if (Array.isArray(modes?.availableModes)) {
      this.availableModes = modes.availableModes.flatMap((item) => {
        const mode = record(item);
        return typeof mode?.id === "string" ? [mode.id] : [];
      });
    }
    const options = asConfigOptions(body?.configOptions);
    if (options.length) this.configOptions = options;
    return sessionId;
  }

  private async dispatch(id: JsonRpcId | undefined, method: string, params: unknown): Promise<void> {
    try {
      if (method === "session/request_permission") {
        const decision = decidePermission(params, this.options.workspace, this.options.permissionMode);
        this.permissionDecisions.push(decision.decision);
        if (id !== undefined) this.peer?.respond(id, decision.result);
        return;
      }
      if (method === "cursor/ask_question") {
        this.questions.push(...readQuestions(params));
        if (id !== undefined) {
          this.peer?.respond(id, {
            outcome: {
              outcome: "skipped",
              reason: "The supervisor will answer in the next prompt on this same Cursor session.",
            },
          });
        }
        return;
      }
      if (method === "cursor/create_plan") {
        this.plan = readPlan(params);
        if (id !== undefined) {
          this.peer?.respond(id, {
            outcome: this.options.mode === "agent"
              ? { outcome: "accepted" }
              : { outcome: "rejected", reason: "Plan captured for the supervisor. Implementation was not started." },
          });
        }
        return;
      }
      if (method === "cursor/update_todos") {
        const body = record(params);
        this.todos = mergeTodos(this.todos, readTodos(body?.todos), body?.merge === true);
        if (id !== undefined) this.peer?.respond(id, { outcome: { outcome: "accepted", todos: this.todos } });
        return;
      }
      if (method === "cursor/task" || method === "cursor/generate_image") {
        this.warnings.push(`${method} was recorded and was not treated as a nested delegation`);
        if (id !== undefined) {
          this.peer?.respond(id, method === "cursor/task"
            ? { outcome: { outcome: "completed" } }
            : { outcome: { outcome: "rejected", reason: "The bridge records image notices and does not return image bytes." } });
        }
        return;
      }
      if (id !== undefined) this.peer?.respondError(id, -32601, `Unhandled method: ${method}`);
      else this.warnings.push(`Ignored ACP notification ${method}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (id !== undefined) this.peer?.respondError(id, -32603, message);
      this.warnings.push(`ACP handler failed for ${method}: ${message}`);
    }
  }
}

function readQuestions(params: unknown): CursorQuestion[] {
  const raw = record(params)?.questions;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const question = record(item);
    if (!question || typeof question.id !== "string" || typeof question.prompt !== "string") return [];
    const options = Array.isArray(question.options)
      ? question.options.flatMap((option) => {
          const entry = record(option);
          if (!entry || typeof entry.id !== "string" || typeof entry.label !== "string") return [];
          return [{ id: entry.id, label: entry.label }];
        })
      : [];
    return [{ id: question.id, prompt: question.prompt, options, allowMultiple: question.allowMultiple === true }];
  });
}

function readPlan(params: unknown): CapturedPlan {
  const body = record(params);
  return {
    name: typeof body?.name === "string" ? body.name : undefined,
    overview: typeof body?.overview === "string" ? body.overview : undefined,
    detail: typeof body?.plan === "string" ? body.plan : undefined,
    entries: readTodos(body?.todos).map((todo) => ({ content: todo.content, status: todo.status })),
  };
}

function readTodos(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const todo = record(item);
    if (!todo || typeof todo.id !== "string" || typeof todo.content !== "string") return [];
    const status = todo.status === "pending" || todo.status === "in_progress" || todo.status === "completed" || todo.status === "cancelled"
      ? todo.status
      : undefined;
    return [{ id: todo.id, content: todo.content, status }];
  });
}

function mergeTodos(existing: TodoItem[], incoming: TodoItem[], merge: boolean): TodoItem[] {
  if (!merge) return incoming;
  const map = new Map(existing.map((todo) => [todo.id, todo]));
  for (const todo of incoming) map.set(todo.id, { ...map.get(todo.id), ...todo });
  return [...map.values()];
}
