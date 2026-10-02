import { AcpClient } from "./acp-client.js";
import { configForReport, loadConfig, type BridgeConfig } from "./config.js";
import { discoverProjectContextFiles } from "./context-files.js";
import { cursorLaunchSpec, probeCommand } from "./discovery.js";
import { assertWorkspace } from "./workspace.js";
import { BRIDGE_NAME, readPackageVersion } from "./version.js";
import type { SpawnSpec } from "./types.js";

export interface DoctorOptions {
  deep?: boolean;
  workspace?: string;
  config?: BridgeConfig;
  spawnSpec?: SpawnSpec;
  clientInfo?: { name?: string; version?: string; capabilities?: Record<string, unknown> };
}

export async function runDoctor(options: DoctorOptions = {}): Promise<Record<string, unknown>> {
  let config: BridgeConfig | undefined;
  let configError: string | undefined;
  try {
    config = options.config ?? loadConfig();
  } catch (err) {
    configError = err instanceof Error ? err.message : String(err);
  }
  const hints: string[] = [];
  if (configError) hints.push(configError);
  if (process.env.IAF_AGENT_BRIDGE_EXECUTOR === "1") {
    hints.push("This process is inside a Cursor agent started by the bridge. delegate will refuse nested calls.");
  }
  if (Number(process.versions.node.split(".")[0]) < 20) hints.push(`Node ${process.versions.node} is below the required Node 20.`);

  let command = options.spawnSpec?.command;
  let args = options.spawnSpec?.args ?? [];
  if (!options.spawnSpec && config) {
    try {
      const spec = cursorLaunchSpec(config);
      command = spec.command;
      args = spec.args;
    } catch (err) {
      hints.push(err instanceof Error ? err.message : String(err));
    }
  }

  const prefix = options.spawnSpec?.args ?? [];
  const timeoutMs = config?.versionProbeTimeoutMs ?? 10_000;
  const version = command
    ? await probeCommand(command, [...prefix, "--version"], timeoutMs)
    : { spawned: false, exitCode: null, stdout: "", error: "Cursor CLI was not found" };
  const auth = command
    ? await readAuth(command, prefix, timeoutMs)
    : { authenticated: "unknown" as const };

  let workspaceInfo: Record<string, unknown> | undefined;
  if (options.workspace) {
    try {
      const workspace = assertWorkspace(options.workspace);
      workspaceInfo = {
        path: workspace,
        exists: true,
        projectContextFiles: discoverProjectContextFiles(workspace),
      };
    } catch (err) {
      workspaceInfo = { path: options.workspace, exists: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  let handshake: Record<string, unknown> | undefined;
  if (options.deep && command && config) {
    handshake = await probeHandshake({
      spawnSpec: options.spawnSpec ?? { command, args },
      config,
      workspace: workspaceInfo?.exists === true ? String(workspaceInfo.path) : process.cwd(),
    });
    if (handshake.ok !== true) hints.push(String(handshake.error ?? "ACP handshake failed"));
  }
  if (!version.spawned) hints.push("Install the Cursor CLI and run `agent login`. https://cursor.com/docs/cli/overview");
  else if (version.exitCode !== 0) hints.push("Cursor CLI responded to --version with a non-zero status.");
  if (auth.authenticated === false) hints.push("Cursor CLI is not authenticated. Run `agent login`.");

  return {
    bridge: { name: BRIDGE_NAME, version: readPackageVersion() },
    client: {
      name: options.clientInfo?.name ?? null,
      version: options.clientInfo?.version ?? null,
      capabilities: options.clientInfo?.capabilities ?? {},
    },
    runtime: {
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      transport: "stdio",
    },
    cursor: {
      found: version.spawned,
      command: command ?? null,
      args,
      version: version.exitCode === 0 ? version.stdout || null : null,
      authenticated: auth.authenticated,
      ...(version.error ? { error: version.error } : {}),
      ...(handshake ? { handshake } : {}),
    },
    ...(workspaceInfo ? { workspace: workspaceInfo } : {}),
    config: config ? configForReport(config) : { error: configError },
    recursionGuard: { executorChild: process.env.IAF_AGENT_BRIDGE_EXECUTOR === "1" },
    hints,
  };
}

async function readAuth(command: string, prefix: string[], timeoutMs: number): Promise<{ authenticated: boolean | "unknown" }> {
  const probe = await probeCommand(command, [...prefix, "status", "--format", "json"], timeoutMs);
  if (!probe.spawned || probe.exitCode !== 0 || !probe.stdout) return { authenticated: "unknown" };
  try {
    const parsed = JSON.parse(probe.stdout) as { isAuthenticated?: boolean; status?: string };
    if (parsed.isAuthenticated === true || parsed.status === "authenticated") return { authenticated: true };
    if (parsed.isAuthenticated === false || parsed.status === "unauthenticated") return { authenticated: false };
  } catch {
    return { authenticated: "unknown" };
  }
  return { authenticated: "unknown" };
}

async function probeHandshake(args: {
  spawnSpec: SpawnSpec;
  config: BridgeConfig;
  workspace: string;
}): Promise<Record<string, unknown>> {
  let workspace = args.workspace;
  try {
    workspace = assertWorkspace(args.workspace);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const client = new AcpClient({
    spawnSpec: args.spawnSpec,
    workspace,
    permissionMode: args.config.permissionMode,
    mode: "agent",
    handshakeTimeoutMs: args.config.handshakeTimeoutMs,
  });
  try {
    await client.start();
    await client.initialize();
    await client.authenticate();
    const sessionId = await client.newSession(workspace);
    return {
      ok: true,
      protocolVersion: client.protocolVersion ?? null,
      agentCapabilities: client.agentCapabilities ?? {},
      sessionOpened: true,
      sessionId,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await client.stop();
  }
}
