import { isInsideWorkspace } from "./workspace.js";
import type { PermissionDecision, PermissionMode } from "./types.js";

export interface PermissionChoice {
  optionId: string;
  kind?: string;
  name?: string;
}

export interface PermissionOutcome {
  result: { outcome: { outcome: "selected"; optionId: string } } | { outcome: { outcome: "cancelled" } };
  decision: PermissionDecision;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function optionsFrom(params: unknown): PermissionChoice[] {
  const record = asRecord(params);
  const raw = record?.options;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const option = asRecord(item);
    if (!option || typeof option.optionId !== "string") return [];
    return [{
      optionId: option.optionId,
      kind: typeof option.kind === "string" ? option.kind : undefined,
      name: typeof option.name === "string" ? option.name : undefined,
    }];
  });
}

function commandText(params: unknown): string {
  const record = asRecord(params);
  const tool = asRecord(record?.toolCall) ?? record;
  const parts: string[] = [];
  if (typeof tool?.title === "string") parts.push(tool.title);
  const raw = asRecord(tool?.rawInput);
  if (raw) {
    for (const key of ["command", "cmd", "script"]) {
      if (typeof raw[key] === "string") parts.push(raw[key] as string);
    }
  }
  return parts.join("\n");
}

function isSecretToken(token: string): boolean {
  const base = token.split(/[/\\]/).pop() ?? token;
  if (/^(id_rsa|id_ed25519)$/i.test(base) || /\.pem$/i.test(base) || /credentials\.json$/i.test(base)) return true;
  if (base === ".env") return true;
  if (base.startsWith(".env.") && !/\.env\.(example|sample|template)$/i.test(base)) return true;
  return false;
}

function deletionEscapes(command: string, workspace: string): boolean {
  if (!/\brm\b/.test(command) || !/(?:^|\s)-[a-z]*[rf]/.test(command)) return false;
  const tokens = command.split(/\s+/).filter((token) => token && !token.startsWith("-") && token !== "rm");
  if (tokens.length === 0) return true;
  return tokens.some((token) => {
    if (token === "/" || token === "/*" || token === "~" || token === "~/" || token === "$HOME") return true;
    if (token.includes("..")) return true;
    return !isInsideWorkspace(token, workspace);
  });
}

export function destructiveReason(text: string, workspace: string): string | undefined {
  const command = text.trim();
  if (!command) return undefined;
  if (/\bgit\s+push\b/i.test(command) && /--force(?:\b|=)|--force-with-lease|(?:^|\s)-f(?:\s|$)/.test(command)) {
    return "force push is not allowed during autonomous execution";
  }
  if (/\bgit\s+reset\b[^;&|\n]*--hard\b/i.test(command)) return "git reset --hard rewrites the working tree";
  if (/\bgit\s+commit\b[^;&|\n]*--amend\b/i.test(command)) return "git commit --amend rewrites history";
  if (/\bgit\s+filter-(?:branch|repo)\b/i.test(command)) return "git history rewriting is not allowed";
  if (/\bgit\s+rebase\b[^;&|\n]*(?:-i|--interactive)\b/i.test(command)) return "interactive history rewrite is not allowed";
  if (/\bDROP\s+(?:DATABASE|SCHEMA|TABLE)\b/i.test(command)) return "destructive SQL drop is not allowed from the shell";
  if (/\bTRUNCATE\b/i.test(command)) return "TRUNCATE is not allowed during autonomous execution";
  if (/\bDELETE\s+FROM\b/i.test(command) && !/\bWHERE\b/i.test(command)) return "DELETE without WHERE is not allowed";
  if (/\bFLUSH(?:ALL|DB)\b/i.test(command)) return "flushing a data store is not allowed";
  if (/\b(?:curl|wget)\b[^|\n]*\|\s*(?:sh|bash|zsh)\b/i.test(command)) return "piping a download into a shell is not allowed";
  if (deletionEscapes(command, workspace)) return "recursive delete escapes the workspace or has no safe target";
  if (/\bgit\s+clean\b[^;&|\n]*-[a-z]*x/i.test(command)) return "git clean -x can remove ignored files, including secrets";
  if (/\bgit\s+add\b/i.test(command)) {
    const tokens = command.split(/\s+/);
    if (tokens.some((token) => isSecretToken(token))) return "refusing to stage a secret file";
  }
  if (/\b(curl|wget|scp|nc)\b/i.test(command) && isSecretToken(command)) {
    return "refusing to send a secret file over the network";
  }
  return undefined;
}

function pick(options: PermissionChoice[], kinds: string[], ids: string[]): PermissionChoice | undefined {
  return options.find((option) => (option.kind && kinds.includes(option.kind)) || ids.includes(option.optionId));
}

export function decidePermission(params: unknown, workspace: string, mode: PermissionMode): PermissionOutcome {
  const options = optionsFrom(params);
  const summary = commandText(params).split("\n")[0]?.slice(0, 180) || "tool request";
  const reason = mode === "allow-all" ? undefined : destructiveReason(commandText(params), workspace);
  if (reason) {
    const reject = pick(options, ["reject_once", "reject_always"], ["reject-once", "reject-always"]);
    if (!reject) {
      return { result: { outcome: { outcome: "cancelled" } }, decision: { action: "reject", summary, reason } };
    }
    return {
      result: { outcome: { outcome: "selected", optionId: reject.optionId } },
      decision: { action: "reject", summary, reason },
    };
  }
  const allow = pick(options, ["allow_once"], ["allow-once"]) ?? pick(options, ["allow_always"], ["allow-always"]);
  if (!allow) {
    return {
      result: { outcome: { outcome: "cancelled" } },
      decision: { action: "reject", summary, reason: "the agent offered no allow option" },
    };
  }
  return {
    result: { outcome: { outcome: "selected", optionId: allow.optionId } },
    decision: { action: "allow", summary },
  };
}
