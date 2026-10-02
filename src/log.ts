import { redact } from "./redact.js";
import type { LogLevel } from "./types.js";

export type { LogLevel };

const RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

let level: LogLevel = "warn";

export function setLogLevel(next: LogLevel): void {
  level = next;
}

export function log(at: LogLevel, message: string): void {
  if (RANK[at] < RANK[level]) return;
  const line = `[iaf-agent-bridge] ${at}: ${redact(message)}`;
  process.stderr.write(`${line}\n`);
}
