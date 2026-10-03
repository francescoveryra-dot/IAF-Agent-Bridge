import { realpathSync } from "node:fs";
import { assertWorkspace } from "../workspace.js";
import { PROJECT_ID } from "./protocol.js";

export interface ProjectAllowlist {
  resolve(projectId: string): string;
  ids(): string[];
}

export function parseProjectList(value: string): Record<string, string> {
  const projects: Record<string, string> = {};
  for (const entry of value.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) throw new Error("Project entries must look like name=/absolute/project.");
    const id = trimmed.slice(0, eq).trim();
    const path = trimmed.slice(eq + 1).trim();
    if (!PROJECT_ID.test(id)) throw new Error(`Project id is not allowed: ${id}`);
    projects[id] = path;
  }
  if (Object.keys(projects).length === 0) throw new Error("At least one name=/absolute/project entry is required.");
  return projects;
}

export function createAllowlist(projects: Record<string, string>): ProjectAllowlist {
  const approved = new Map<string, string>();
  for (const [id, path] of Object.entries(projects)) {
    if (!PROJECT_ID.test(id)) throw new Error(`Project id is not allowed: ${id}`);
    approved.set(id, assertWorkspace(path));
  }
  return {
    ids: () => [...approved.keys()],
    resolve(projectId: string): string {
      const canonical = approved.get(projectId);
      if (!canonical) throw new Error(`Project ${projectId} is not in the local allowlist.`);
      let current: string;
      try {
        current = realpathSync(canonical);
      } catch {
        throw new Error(`Project ${projectId} is not available.`);
      }
      if (current !== canonical) {
        throw new Error(`Project ${projectId} no longer matches the approved directory.`);
      }
      return current;
    },
  };
}
