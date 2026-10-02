import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, parse, relative, resolve } from "node:path";
import { BridgeError } from "./errors.js";

export function assertWorkspace(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new BridgeError("invalid-workspace", "workspace must be a non-empty directory path.");
  }
  let resolved: string;
  try {
    resolved = realpathSync(resolve(trimmed));
  } catch {
    throw new BridgeError(
      "invalid-workspace",
      `workspace does not exist: ${trimmed}. Create the project directory first, then delegate into it.`,
    );
  }
  let info;
  try {
    info = statSync(resolved);
  } catch {
    throw new BridgeError("invalid-workspace", `workspace is not accessible: ${resolved}`);
  }
  if (!info.isDirectory()) {
    throw new BridgeError("invalid-workspace", `workspace is not a directory: ${resolved}`);
  }
  if (resolved === parse(resolved).root) {
    throw new BridgeError("invalid-workspace", "workspace must not be the filesystem root. Pass the project directory.");
  }
  let home = homedir();
  try {
    home = realpathSync(home);
  } catch {
    // Keep the unresolved home path when it cannot be canonicalized.
  }
  if (resolved === home) {
    throw new BridgeError(
      "invalid-workspace",
      "workspace must not be the home directory. Pass the project directory so autonomous edits stay inside the task.",
    );
  }
  return resolved;
}

export function isInsideWorkspace(candidate: string, workspace: string): boolean {
  const root = resolve(workspace);
  const target = resolve(workspace, candidate);
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
