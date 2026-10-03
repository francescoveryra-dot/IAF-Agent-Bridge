#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { setLogLevel } from "./log.js";
import { buildServer, installSignalCleanup } from "./mcp-server.js";
import { createAllowlist } from "./remote/allowlist.js";
import { startLocalMcp } from "./remote/local-mcp.js";
import { chatgptConfigPath, chatgptSocketPath, loadProjectConfig, localDoctorSummary, setupChatgpt } from "./remote/setup.js";
import { readPackageVersion } from "./version.js";

function isMain(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

async function doctorCommand(argv: string[]): Promise<void> {
  const report = await runDoctor({
    deep: argv.includes("--deep"),
    workspace: readFlag(argv, "--workspace"),
  });
  if (argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const cursor = report.cursor as { found?: boolean; command?: string | null; version?: string | null; authenticated?: unknown };
    const bridge = report.bridge as { version?: string };
    process.stdout.write(`IAF Agent Bridge ${bridge.version}\n`);
    process.stdout.write(`Node ${process.versions.node} ${process.platform}/${process.arch}\n`);
    process.stdout.write(`Cursor: ${cursor.found ? cursor.command : "not found"}\n`);
    process.stdout.write(`Cursor version: ${cursor.version ?? "unavailable"}\n`);
    process.stdout.write(`Authenticated: ${String(cursor.authenticated)}\n`);
    for (const hint of report.hints as string[]) process.stdout.write(`- ${hint}\n`);
  }
  const cursor = report.cursor as { found?: boolean; authenticated?: unknown; handshake?: { ok?: boolean } };
  const failed = cursor.found === false || cursor.authenticated === false || cursor.handshake?.ok === false;
  process.exitCode = failed ? 1 : 0;
}

async function main(): Promise<void> {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
    process.stderr.write(`iaf-agent-bridge requires Node 20 or newer (found ${process.versions.node}).\n`);
    process.exit(1);
  }
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write("Usage: iaf-agent-bridge [--version] [mcp] | doctor [--deep] [--json] [--workspace path] | setup chatgpt --project name=/absolute/path | chatgpt\n");
    return;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${readPackageVersion()}\n`);
    return;
  }
  if (argv[0] === "doctor") {
    await doctorCommand(argv.slice(1));
    return;
  }
  if (argv[0] === "setup" && argv[1] === "chatgpt") {
    const projects = argv.filter((_, index) => argv[index - 1] === "--project");
    if (projects.length === 0) {
      process.stderr.write("Usage: iaf-agent-bridge setup chatgpt --project name=/absolute/path\n");
      process.exit(1);
    }
    const summary = await localDoctorSummary();
    process.stdout.write(`IAF Agent Bridge ${summary.version}\n`);
    process.stdout.write(`Cursor found: ${summary.found}\n`);
    process.stdout.write(`Cursor authenticated: ${summary.authenticated}\n`);
    const configured = await setupChatgpt(projects.join(","));
    process.stdout.write(`Approved projects saved locally: ${configured.configPath}\n`);
    process.stdout.write(`Next: iaf-agent-bridge chatgpt\n`);
    process.stdout.write("OpenAI tunnel setup is a separate account step. This command does not create a key.\n");
    if (!summary.found || !summary.authenticated) process.exitCode = 1;
    return;
  }
  if (argv[0] === "chatgpt") {
    try {
      setLogLevel(loadConfig().logLevel);
    } catch (err) {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
    const projects = loadProjectConfig(chatgptConfigPath());
    const server = await startLocalMcp({
      allowlist: createAllowlist(projects),
      socketPath: process.env.IAF_CHATGPT_LISTEN === "tcp" ? undefined : chatgptSocketPath(),
      allowLoopbackTcp: process.env.IAF_CHATGPT_LISTEN === "tcp",
      port: 0,
    });
    if (server.socketPath) {
      process.stdout.write(`IAF ChatGPT MCP socket: ${server.socketPath}\n`);
      process.stdout.write("tunnel-client dial: channel=main,url=http://127.0.0.1/mcp,unix-socket=");
      process.stdout.write(`${server.socketPath}\n`);
    } else {
      process.stdout.write(`IAF ChatGPT MCP listening at ${server.mcpUrl}\n`);
    }
    const stop = () => {
      void server.close().finally(() => process.exit(0));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    return;
  }
  if (argv.length === 0 || argv[0] === "mcp") {
    try {
      setLogLevel(loadConfig().logLevel);
    } catch (err) {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
    const bridge = buildServer();
    installSignalCleanup(bridge.inFlight, bridge.pending);
    await bridge.server.connect(new StdioServerTransport());
    return;
  }
  process.stderr.write("Usage: iaf-agent-bridge [--version] [mcp] | doctor [--deep] [--json] [--workspace path] | setup chatgpt --project name=/absolute/path | chatgpt\n");
  process.exit(1);
}

if (isMain()) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
