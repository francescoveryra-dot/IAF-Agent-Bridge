import { runDoctor } from "../doctor.js";
import { log } from "../log.js";
import { runTurn } from "../turn.js";
import type { AgentMode } from "../types.js";
import type { ProjectAllowlist } from "./allowlist.js";
import { MAX_RESULT_BYTES, REMOTE_PROTOCOL, type RemoteError, type RemoteJob } from "./protocol.js";

export interface RemoteDelegateInput {
  prompt: string;
  workspace: string;
  sessionId?: string;
  mode: AgentMode;
  model?: string;
  fast: boolean;
  signal: AbortSignal;
}

export interface RemoteHandlers {
  delegate(input: RemoteDelegateInput): Promise<unknown>;
  doctor(input: { deep: boolean; workspace?: string }): Promise<unknown>;
  cancel(input: { sessionId: string }): Promise<unknown>;
}

export interface ConnectorOptions {
  gatewayUrl: string;
  connectorToken: string;
  allowlist: ProjectAllowlist;
  handlers?: RemoteHandlers;
  retryMs?: number;
}

export interface Connector {
  close(): Promise<void>;
}

function failure(err: unknown): RemoteError {
  const message = err instanceof Error ? err.message : String(err);
  const reason = message.includes("not in the local allowlist") ? "unknown-project" : "connector-error";
  return { reason, message: message.slice(0, 500) };
}

function withoutWorkspace(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy = { ...(value as Record<string, unknown>) };
  delete copy.workspace;
  return copy;
}

export async function startConnector(options: ConnectorOptions): Promise<Connector> {
  const controllers = new Map<string, AbortController>();
  const inflight = new Map<string, Promise<void>>();
  const stop = new AbortController();
  const retryMs = options.retryMs ?? 250;

  async function post(job: RemoteJob, ok: boolean, result?: unknown, error?: RemoteError): Promise<void> {
    let payload = { protocol: REMOTE_PROTOCOL, id: job.id, ok, result, error };
    if (Buffer.byteLength(JSON.stringify(payload)) > MAX_RESULT_BYTES) {
      payload = {
        protocol: REMOTE_PROTOCOL,
        id: job.id,
        ok: false,
        result: undefined,
        error: { reason: "oversized-result", message: "Cursor's result exceeded the transport cap and was not forwarded." },
      };
    }
    await fetch(`${options.gatewayUrl}/connector/result`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.connectorToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: stop.signal,
    });
  }

  async function execute(job: RemoteJob): Promise<void> {
    const controller = new AbortController();
    const startedAt = Date.now();
    log("info", `remote.cursor.start job=${job.id} kind=${job.kind}`);
    try {
      if (job.kind === "delegate") {
        if (!job.projectId || !job.prompt) throw new Error("Delegate job is missing a project or a prompt.");
        const workspace = options.allowlist.resolve(job.projectId);
        controllers.set(job.sessionId ?? job.id, controller);
        const result = options.handlers
          ? await options.handlers.delegate({
            prompt: job.prompt,
            workspace,
            sessionId: job.sessionId,
            mode: job.mode ?? "agent",
            model: job.model,
            fast: job.fast ?? false,
            signal: controller.signal,
          })
          : await runTurn({
            prompt: job.prompt,
            workspace,
            sessionId: job.sessionId,
            mode: job.mode ?? "agent",
            model: job.model,
            fast: job.fast ?? false,
          }, {
            signal: controller.signal,
            onSession: (sessionId) => controllers.set(sessionId, controller),
          });
        await post(job, true, withoutWorkspace(result));
        return;
      }
      if (job.kind === "doctor") {
        const workspace = job.projectId ? options.allowlist.resolve(job.projectId) : undefined;
        const result = options.handlers
          ? await options.handlers.doctor({ deep: job.deep ?? false, workspace })
          : await runDoctor({ deep: job.deep ?? false, workspace });
        await post(job, true, withoutWorkspace(result));
        return;
      }
      const active = controllers.get(job.sessionId ?? "");
      active?.abort();
      const result = options.handlers
        ? await options.handlers.cancel({ sessionId: job.sessionId ?? "" })
        : { cancelled: Boolean(active), sessionId: job.sessionId ?? "" };
      await post(job, true, result);
    } catch (err) {
      if (stop.signal.aborted) return;
      await post(job, false, undefined, failure(err));
    } finally {
      log("info", `remote.cursor.done job=${job.id} kind=${job.kind} durationMs=${Date.now() - startedAt}`);
      for (const [key, active] of controllers) {
        if (active === controller) controllers.delete(key);
      }
    }
  }

  function once(job: RemoteJob): Promise<void> {
    const existing = inflight.get(job.id);
    if (existing) return existing;
    const promise = execute(job).finally(() => {
      setTimeout(() => inflight.delete(job.id), 60_000);
    });
    inflight.set(job.id, promise);
    return promise;
  }

  const loop = (async () => {
    while (!stop.signal.aborted) {
      try {
        const response = await fetch(`${options.gatewayUrl}/connector/poll`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.connectorToken}`,
            "content-type": "application/json",
          },
          body: "{}",
          signal: stop.signal,
        });
        if (response.status === 401) throw new Error("connector unauthorized");
        if (!response.ok) throw new Error(`connector poll failed (${response.status})`);
        const body = await response.json() as { job?: RemoteJob | null };
        if (body.job?.protocol === REMOTE_PROTOCOL) void once(body.job);
      } catch (err) {
        if (stop.signal.aborted) return;
        if (err instanceof Error && err.message === "connector unauthorized") throw err;
        await new Promise((resolve) => setTimeout(resolve, retryMs));
      }
    }
  })().catch(() => undefined);

  return {
    async close() {
      stop.abort();
      for (const controller of controllers.values()) controller.abort();
      await Promise.allSettled(inflight.values());
      await loop;
    },
  };
}
