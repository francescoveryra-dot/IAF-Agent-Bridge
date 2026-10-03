#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { setLogLevel } from "./log.js";
import { buildServer, installSignalCleanup } from "./mcp-server.js";
import { createAllowlist, parseProjectList } from "./remote/allowlist.js";
import { startConnector } from "./remote/connector.js";
import { startGateway } from "./remote/gateway.js";
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
    process.stdout.write("Usage: iaf-agent-bridge [--version] [mcp] | doctor [--deep] [--json] [--workspace path] | gateway | connector\n");
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
  if (argv[0] === "gateway") {
    const chatToken = process.env.IAF_GATEWAY_CHAT_TOKEN ?? "";
    const connectorToken = process.env.IAF_GATEWAY_CONNECTOR_TOKEN ?? "";
    const gateway = await startGateway({
      chatToken,
      connectorToken,
      port: Number(process.env.IAF_GATEWAY_PORT ?? 8787),
    });
    process.stdout.write(`IAF remote gateway listening at ${gateway.mcpUrl}\n`);
    const stop = () => {
      void gateway.close().finally(() => process.exit(0));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    return;
  }
  if (argv[0] === "connector") {
    const gatewayUrl = process.env.IAF_GATEWAY_URL ?? "";
    const connectorToken = process.env.IAF_GATEWAY_CONNECTOR_TOKEN ?? "";
    const projects = process.env.IAF_REMOTE_PROJECTS ?? "";
    if (!gatewayUrl) {
      process.stderr.write("IAF_GATEWAY_URL is required.\n");
      process.exit(1);
    }
    const connector = await startConnector({
      gatewayUrl,
      connectorToken,
      allowlist: createAllowlist(parseProjectList(projects)),
    });
    process.stdout.write("IAF remote connector is polling the gateway.\n");
    const stop = () => {
      void connector.close().finally(() => process.exit(0));
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
  process.stderr.write("Usage: iaf-agent-bridge [--version] [mcp] | doctor [--deep] [--json] [--workspace path] | gateway | connector\n");
  process.exit(1);
}

if (isMain()) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
