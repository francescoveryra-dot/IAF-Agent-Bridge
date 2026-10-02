import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { spawn } from "node:child_process";
import { BridgeError } from "./errors.js";
import { redact } from "./redact.js";
import type { BridgeConfig } from "./config.js";
import type { SpawnSpec } from "./types.js";

function canExecute(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function pathLookup(name: string, pathEnv: string): string | null {
  const suffixes = process.platform === "win32" ? ["", ".exe", ".cmd"] : [""];
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const suffix of suffixes) {
      const candidate = join(dir, `${name}${suffix}`);
      if (canExecute(candidate)) return candidate;
    }
  }
  return null;
}

export function locateCursorBinary(config: BridgeConfig, env: NodeJS.ProcessEnv = process.env): string {
  if (config.cursorAgent) {
    if (!canExecute(config.cursorAgent)) {
      throw new BridgeError(
        "cursor-not-found",
        `IAF_CURSOR_AGENT is set to "${config.cursorAgent}", but that file is not executable. Install the Cursor CLI or point the variable at the agent binary.`,
      );
    }
    return config.cursorAgent;
  }
  const pathEnv = env.PATH ?? "";
  const fromPath = pathLookup("agent", pathEnv) ?? pathLookup("cursor-agent", pathEnv);
  if (fromPath) return fromPath;
  const home = homedir();
  for (const candidate of [join(home, ".local", "bin", "agent"), join(home, ".local", "bin", "cursor-agent")]) {
    if (canExecute(candidate)) return candidate;
  }
  throw new BridgeError(
    "cursor-not-found",
    "Cursor CLI was not found. Install it, make sure `agent` is on PATH, and run `agent login`. See https://cursor.com/docs/cli/overview",
  );
}

export function cursorLaunchSpec(config: BridgeConfig, env: NodeJS.ProcessEnv = process.env): SpawnSpec {
  return { command: locateCursorBinary(config, env), args: config.cursorAgentArgs };
}

export interface CommandProbe {
  spawned: boolean;
  exitCode: number | null;
  stdout: string;
  error?: string;
}

export function probeCommand(command: string, args: string[], timeoutMs: number, cwd = process.cwd()): Promise<CommandProbe> {
  return new Promise((resolve) => {
    let stdout = "";
    let settled = false;
    const finish = (result: CommandProbe) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < 8_000) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", () => {});
    child.stderr?.on("error", () => {});
    child.on("error", (err) => finish({ spawned: false, exitCode: null, stdout: "", error: err.message }));
    child.on("close", (code) => {
      finish({
        spawned: true,
        exitCode: code,
        stdout: redact(stdout).trim().slice(0, 8_000),
        ...(code === 0 ? {} : { error: `exited ${code}` }),
      });
    });
    const timer = setTimeout(() => {
      if (child.pid) {
        try {
          process.kill(child.pid, "SIGKILL");
        } catch {
          // The probe is already gone.
        }
      }
      finish({ spawned: true, exitCode: null, stdout: "", error: `timed out after ${timeoutMs}ms` });
    }, timeoutMs);
  });
}
