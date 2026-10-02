import { BridgeError } from "./errors.js";
import type { LogLevel, PermissionMode } from "./types.js";

export interface BridgeConfig {
  executor: "cursor";
  cursorAgent?: string;
  cursorAgentArgs: string[];
  permissionMode: PermissionMode;
  logLevel: LogLevel;
  handshakeTimeoutMs: number;
  turnTimeoutMs: number;
  idleTimeoutMs: number;
  versionProbeTimeoutMs: number;
  forceGraceMs: number;
}

function readNumber(env: NodeJS.ProcessEnv, name: string, fallback: number, minimum: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum) {
    throw new BridgeError(
      "invalid-config",
      `${name} must be a number greater than or equal to ${minimum}. Received "${raw}".`,
    );
  }
  return value;
}

export function parseArgv(raw: string): string[] {
  const args: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  const text = raw.trim();
  if (!text) return args;
  let consumed = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    args.push(match[1] ?? match[2] ?? match[3] ?? "");
    consumed = index + match[0].length;
  }
  if (text.slice(consumed).includes('"') || text.slice(consumed).includes("'")) {
    throw new BridgeError("invalid-config", "IAF_CURSOR_AGENT_ARGS has an unclosed quote.");
  }
  return args;
}

export function agentArgs(extra: string[]): string[] {
  return extra.includes("acp") ? extra : [...extra, "acp"];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const permissionRaw = (env.IAF_PERMISSION_MODE ?? "autonomous").trim();
  if (permissionRaw !== "autonomous" && permissionRaw !== "allow-all") {
    throw new BridgeError(
      "invalid-config",
      `IAF_PERMISSION_MODE must be "autonomous" or "allow-all". Received "${permissionRaw}".`,
    );
  }
  const levelRaw = (env.IAF_LOG_LEVEL ?? "warn").trim();
  const levels: LogLevel[] = ["debug", "info", "warn", "error", "silent"];
  if (!levels.includes(levelRaw as LogLevel)) {
    throw new BridgeError("invalid-config", `IAF_LOG_LEVEL must be one of ${levels.join(", ")}.`);
  }
  const executor = (env.IAF_EXECUTOR ?? "cursor").trim();
  if (executor !== "cursor") {
    throw new BridgeError(
      "executor-unavailable",
      `IAF_EXECUTOR="${executor}" is not available. V1 provides the Cursor executor only.`,
    );
  }
  const cursorAgent = env.IAF_CURSOR_AGENT?.trim();
  return {
    executor: "cursor",
    cursorAgent: cursorAgent ? cursorAgent : undefined,
    cursorAgentArgs: agentArgs(parseArgv(env.IAF_CURSOR_AGENT_ARGS ?? "")),
    permissionMode: permissionRaw,
    logLevel: levelRaw as LogLevel,
    handshakeTimeoutMs: readNumber(env, "IAF_HANDSHAKE_TIMEOUT_MS", 30_000, 1000),
    turnTimeoutMs: readNumber(env, "IAF_TURN_TIMEOUT_MS", 60 * 60 * 1000, 1000),
    idleTimeoutMs: readNumber(env, "IAF_IDLE_TIMEOUT_MS", 0, 0),
    versionProbeTimeoutMs: readNumber(env, "IAF_VERSION_PROBE_TIMEOUT_MS", 10_000, 1000),
    forceGraceMs: readNumber(env, "IAF_FORCE_GRACE_MS", 5_000, 0),
  };
}

export function configForReport(config: BridgeConfig): Record<string, unknown> {
  return {
    executor: config.executor,
    cursorAgentOverride: Boolean(config.cursorAgent),
    cursorAgentArgCount: config.cursorAgentArgs.length,
    permissionMode: config.permissionMode,
    logLevel: config.logLevel,
    handshakeTimeoutMs: config.handshakeTimeoutMs,
    turnTimeoutMs: config.turnTimeoutMs,
    idleTimeoutMs: config.idleTimeoutMs,
  };
}
