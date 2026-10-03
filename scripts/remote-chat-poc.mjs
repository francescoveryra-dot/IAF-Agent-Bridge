import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const stateDir = resolve(process.env.IAF_REMOTE_STATE_DIR ?? join(tmpdir(), "iaf-remote-chat-poc"));
const workspace = join(stateDir, "workspace");
mkdirSync(workspace, { recursive: true });
if (resolve(workspace) === repoRoot || resolve(workspace).startsWith(`${repoRoot}/`)) {
  throw new Error("The proof workspace must stay outside this repository.");
}

const configPath = join(stateDir, "chatgpt.json");
const setup = spawn(process.execPath, ["dist/cli.js", "setup", "chatgpt", "--project", `demo=${workspace}`], {
  cwd: repoRoot,
  env: { ...process.env, IAF_CHATGPT_CONFIG: configPath },
  stdio: ["ignore", "inherit", "inherit"],
});
const setupCode = await new Promise((resolveCode) => setup.once("exit", resolveCode));
if (setupCode !== 0) throw new Error(`setup chatgpt exited ${setupCode ?? "signal"}`);

const server = spawn(process.execPath, ["dist/cli.js", "chatgpt"], {
  cwd: repoRoot,
  env: { ...process.env, IAF_CHATGPT_CONFIG: configPath, IAF_CHATGPT_LISTEN: "tcp", IAF_LOG_LEVEL: "info" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (chunk) => {
  for (const line of String(chunk).split("\n")) {
    if (line.includes("remote.")) process.stderr.write(`${line}\n`);
  }
});
const mcpUrl = await new Promise((resolveUrl, reject) => {
  const timer = setTimeout(() => reject(new Error("The local MCP server did not print its URL.")), 10_000);
  let buffer = "";
  server.stdout.on("data", (chunk) => {
    buffer += String(chunk);
    const match = buffer.match(/listening at (http:\/\/127\.0\.0\.1:\d+\/mcp)/);
    if (match?.[1]) {
      clearTimeout(timer);
      resolveUrl(match[1]);
    }
  });
  server.once("exit", (code) => {
    clearTimeout(timer);
    reject(new Error(`The local MCP server exited (${code ?? "signal"}).`));
  });
});

const client = new Client({ name: "iaf-remote-poc", version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
const doctor = await client.callTool({ name: "doctor", arguments: { projectId: "demo" } });
const body = JSON.parse(doctor.content?.[0]?.text ?? "");
if (doctor.isError || body.cursor?.found !== true || body.cursor?.authenticated !== true) {
  throw new Error("Local ChatGPT MCP doctor did not find an authenticated Cursor CLI.");
}
if (JSON.stringify(body).includes(workspace)) throw new Error("Doctor returned the workspace path.");
const missing = await client.callTool({ name: "delegate", arguments: { projectId: "other", prompt: "do not run" } });
if (!String(missing.content?.[0]?.text ?? "").includes("unknown-project")) throw new Error("An unknown project id was not rejected.");
await client.close();
process.stdout.write(`Remote doctor passed on the local MCP server. Bridge ${body.bridge?.version ?? "unknown"}.\n`);
process.stdout.write(`Workspace: ${workspace}\n`);
process.stdout.write(`Test listener: ${mcpUrl}\n`);
process.stdout.write("Personal Private mode uses a user-owned socket. This doctor check used loopback TCP so the test client could connect.\n");
process.stdout.write("Secure MCP Tunnel was not started. No OpenAI credential was read.\n");
server.kill("SIGTERM");
process.exit(0);
