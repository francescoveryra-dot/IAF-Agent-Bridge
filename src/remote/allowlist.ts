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
    if (eq <= 0) throw new Error("IAF_REMOTE_PROJECTS entries must look like name=/absolute/project.");
    const id = trimmed.slice(0, eq).trim();
    const path = trimmed.slice(eq + 1).trim();
    if (!PROJECT_ID.test(id)) throw new Error(`Project id is not allowed: ${id}`);
    projects[id] = path;
  }
  if (Object.keys(projects).length === 0) throw new Error("IAF_REMOTE_PROJECTS needs at least one name=/absolute/project entry.");
  return projects;
}

export function createAllowlist(projects: Record<string, string>): ProjectAllowlist {
  const resolved = new Map<string, string>();
  for (const [id, path] of Object.entries(projects)) {
    if (!PROJECT_ID.test(id)) throw new Error(`Project id is not allowed: ${id}`);
    resolved.set(id, assertWorkspace(path));
  }
  return {
    ids: () => [...resolved.keys()],
    resolve(projectId: string): string {
      const workspace = resolved.get(projectId);
      if (!workspace) {
        throw new Error(`Project ${projectId} is not in the local allowlist.`);
      }
      return workspace;
    },
  };
}
