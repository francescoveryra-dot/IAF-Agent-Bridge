import { existsSync } from "node:fs";
import { join } from "node:path";

const CONTEXT_FILES = [
  "MASTER_PROMPT.md",
  "PROJECT_SPEC.md",
  "ENVIRONMENT.md",
  "ARCHITECTURE.md",
  "PLAN.md",
  "TRACEABILITY.md",
];

export function discoverProjectContextFiles(workspace: string): string[] {
  return CONTEXT_FILES.filter((name) => existsSync(join(workspace, name)));
}
