import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { runDoctor } from "../doctor.js";
import { createAllowlist, parseProjectList } from "./allowlist.js";

export function chatgptConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.IAF_CHATGPT_CONFIG ?? join(homedir(), ".iaf-agent-bridge", "chatgpt.json");
}

export function chatgptSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.IAF_CHATGPT_SOCKET ?? join(dirname(chatgptConfigPath(env)), "chatgpt.sock");
}

export function loadProjectConfig(file: string): Record<string, string> {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { projects?: Record<string, string> };
  if (!parsed.projects || Object.keys(parsed.projects).length === 0) {
    throw new Error("ChatGPT config is missing projects.");
  }
  return parsed.projects;
}

export async function setupChatgpt(projectList: string, env: NodeJS.ProcessEnv = process.env): Promise<{ configPath: string; socketPath: string }> {
  const approved = createAllowlist(parseProjectList(projectList));
  const projects: Record<string, string> = {};
  for (const id of approved.ids()) projects[id] = approved.resolve(id);
  const configPath = chatgptConfigPath(env);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify({ projects }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(configPath, 0o600);
  return { configPath, socketPath: chatgptSocketPath(env) };
}

export async function localDoctorSummary(): Promise<{ version: string; found: boolean; authenticated: boolean }> {
  const report = await runDoctor();
  const bridge = report.bridge as { version?: string };
  const cursor = report.cursor as { found?: boolean; authenticated?: unknown };
  return {
    version: bridge.version ?? "unknown",
    found: cursor.found === true,
    authenticated: cursor.authenticated === true,
  };
}
