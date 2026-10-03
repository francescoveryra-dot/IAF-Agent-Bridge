import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const doctorOnly = process.argv.includes("--doctor-only");
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const stateDir = resolve(process.env.IAF_REMOTE_STATE_DIR ?? join(tmpdir(), "iaf-remote-chat-poc"));
const workspace = join(stateDir, "workspace");
mkdirSync(workspace, { recursive: true });
if (resolve(workspace) === repoRoot || resolve(workspace).startsWith(`${repoRoot}/`)) {
  throw new Error("The proof workspace must stay outside this repository.");
}

const chatToken = process.env.IAF_GATEWAY_CHAT_TOKEN ?? randomBytes(32).toString("hex");
const connectorToken = process.env.IAF_GATEWAY_CONNECTOR_TOKEN ?? randomBytes(32).toString("hex");
if (chatToken === connectorToken) throw new Error("The ChatGPT token and the connector token must differ.");
const envFile = join(stateDir, "poc.env");
writeFileSync(envFile, `IAF_GATEWAY_CHAT_TOKEN=${chatToken}\nIAF_GATEWAY_CONNECTOR_TOKEN=${connectorToken}\n`, { mode: 0o600 });
chmodSync(envFile, 0o600);

const children = [];
function start(command, args, extraEnv) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, IAF_LOG_LEVEL: process.env.IAF_LOG_LEVEL ?? "info", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (chunk) => {
    for (const line of String(chunk).split("\n")) {
      if (line.includes("remote.")) process.stderr.write(`${line}\n`);
    }
  });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) child.kill("SIGTERM");
}

process.once("SIGINT", () => {
  stopAll();
  process.exit(0);
});
process.once("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

const gateway = start(process.execPath, ["dist/cli.js", "gateway"], {
  IAF_GATEWAY_CHAT_TOKEN: chatToken,
  IAF_GATEWAY_CONNECTOR_TOKEN: connectorToken,
  IAF_GATEWAY_PORT: "0",
});
const mcpUrl = await new Promise((resolveUrl, reject) => {
  const timer = setTimeout(() => reject(new Error("The gateway did not print its MCP URL.")), 10_000);
  let buffer = "";
  gateway.stdout.on("data", (chunk) => {
    buffer += String(chunk);
    const match = buffer.match(/listening at (http:\/\/127\.0\.0\.1:\d+\/mcp)/);
    if (match?.[1]) {
      clearTimeout(timer);
      resolveUrl(match[1]);
    }
  });
  gateway.once("exit", (code) => {
    clearTimeout(timer);
    reject(new Error(`The gateway exited before listening (${code ?? "signal"}).`));
  });
});
const gatewayUrl = new URL(mcpUrl).origin;

await new Promise((resolveReady, reject) => {
  const timer = setTimeout(() => reject(new Error("The gateway health check did not succeed.")), 10_000);
  const poll = async () => {
    try {
      const response = await fetch(`${gatewayUrl}/healthz`);
      if (response.ok) {
        clearTimeout(timer);
        resolveReady();
        return;
      }
    } catch {
      // The listener may still be starting.
    }
    setTimeout(poll, 100);
  };
  void poll();
});

const connector = start(process.execPath, ["dist/cli.js", "connector"], {
  IAF_GATEWAY_URL: gatewayUrl,
  IAF_GATEWAY_CONNECTOR_TOKEN: connectorToken,
  IAF_REMOTE_PROJECTS: `demo=${workspace}`,
});
await new Promise((resolveReady) => {
  const timer = setTimeout(resolveReady, 500);
  connector.stdout.on("data", () => {
    clearTimeout(timer);
    resolveReady();
  });
});

const client = new Client({ name: "iaf-remote-poc", version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl), {
  requestInit: { headers: { authorization: `Bearer ${chatToken}` } },
}));
const doctor = await client.callTool({ name: "doctor", arguments: { projectId: "demo" } });
const doctorText = doctor.content?.[0]?.text ?? "";
const doctorBody = JSON.parse(doctorText);
const cursor = doctorBody.cursor ?? {};
const bridge = doctorBody.bridge ?? {};
if (doctor.isError || cursor.found !== true || cursor.authenticated !== true) {
  throw new Error("Remote doctor did not find an authenticated Cursor CLI.");
}
const missing = await client.callTool({ name: "delegate", arguments: { projectId: "other", prompt: "do not run" } });
const traversed = await client.callTool({ name: "delegate", arguments: { projectId: "../etc", prompt: "do not run" } });
if (!String(missing.content?.[0]?.text ?? "").includes("unknown-project")) {
  throw new Error("An unknown project id was not rejected.");
}
if (traversed.isError !== true) throw new Error("A path-like project id was not rejected.");
await client.close();

process.stdout.write("Remote doctor passed through the gateway.\n");
process.stdout.write(`Bridge ${bridge.version ?? "unknown"}; Cursor found; Cursor authenticated.\n`);
process.stdout.write('Allowlist accepts only project id "demo".\n');
process.stdout.write(`Workspace: ${workspace}\n`);
process.stdout.write(`Gateway MCP URL for tunnel-client: ${mcpUrl}\n`);
process.stdout.write(`Credential file (mode 600, not in the repository): ${envFile}\n`);

const tunnelKey = process.env.CONTROL_PLANE_API_KEY ?? "";
const tunnelId = process.env.CONTROL_PLANE_TUNNEL_ID ?? "";
if (!tunnelKey || !tunnelId) {
  process.stdout.write("Secure MCP Tunnel was not started. CONTROL_PLANE_API_KEY and CONTROL_PLANE_TUNNEL_ID are not both set.\n");
} else {
  let installed = false;
  try {
    execFileSync("/usr/bin/which", ["tunnel-client"], { stdio: "ignore" });
    installed = true;
  } catch {
    installed = false;
  }
  if (!installed) {
    process.stdout.write("tunnel-client is not installed. The official binary is the latest release of openai/tunnel-client.\n");
  } else {
    process.stdout.write("Starting tunnel-client. The control-plane key is not printed.\n");
    start("tunnel-client", ["run"], {
      CONTROL_PLANE_API_KEY: tunnelKey,
      CONTROL_PLANE_TUNNEL_ID: tunnelId,
      MCP_SERVER_URL: mcpUrl,
    });
  }
}

if (doctorOnly) {
  stopAll();
  process.exit(0);
}
process.stdout.write("Gateway and connector are running. Stop them with Ctrl-C.\n");
