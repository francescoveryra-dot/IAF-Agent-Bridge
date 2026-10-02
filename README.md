# IAF Agent Bridge

IAF Agent Bridge is an MCP server that lets a supervisor such as Codex or ChatGPT send work to Cursor Agent and continue the same Cursor session until the requested work is done.

The bridge carries prompts, session identity, and Cursor's reply. It does not replace the supervisor's judgment and it does not turn the loop into a review checklist.

```
Codex / ChatGPT / another MCP host
        |
        | MCP (stdio)
        v
IAF Agent Bridge
        |
        | ACP (stdio JSON-RPC)
        v
Cursor Agent
        |
        v
Target repository
```

Cursor Agent is the only production executor in V1. The server has an internal executor boundary so another agent can be added later without a second MCP server.

## Prerequisites

- Node.js 20 or newer
- The [Cursor CLI](https://cursor.com/docs/cli/overview), available as `agent` on `PATH`
- A Cursor login: `agent login`

The bridge does not need an OpenAI API key. Codex uses the ChatGPT login you already have. Cursor uses `agent login`.

This repository is the source. The npm package name `iaf-agent-bridge` is reserved for a future publish and is not on the registry yet. Install from this clone.

## Install

```shell
git clone git@github.com:francescoveryra-dot/IAF-Agent-Bridge.git
cd IAF-Agent-Bridge
npm install
npm run build
node dist/cli.js --version
node dist/cli.js doctor
```

`doctor` should report the Cursor executable, its version, and `Authenticated: true`. `doctor --deep` also opens a short ACP session. It does not print account details.

## Codex

Add this to `~/.codex/config.toml`. Replace the path with your clone:

```toml
[mcp_servers.iaf-agent-bridge]
command = "node"
args = ["/ABSOLUTE/PATH/IAF-Agent-Bridge/dist/cli.js"]
```

Restart Codex. The skill in `skills/iaf-agent-bridge/` tells Codex to read Cursor's reply as a pasted answer and to continue the same session while work remains.

A local plugin manifest is in `.codex-plugin/plugin.json` for hosts that install the repository as a plugin. It launches `node dist/cli.js` from the plugin directory.

## Claude Code

```shell
claude mcp add iaf-agent-bridge -- node /ABSOLUTE/PATH/IAF-Agent-Bridge/dist/cli.js
```

Or install this repository as a plugin. `.claude-plugin/mcp.json` points at `${CLAUDE_PLUGIN_ROOT}/dist/cli.js`.

## Generic MCP and other hosts

One stdio server serves every host. Use the shape that host expects.

```json
{
  "mcpServers": {
    "iaf-agent-bridge": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/IAF-Agent-Bridge/dist/cli.js"]
    }
  }
}
```

VS Code and Visual Studio use a `servers` object and `"type": "stdio"`. Zed uses `context_servers`. OpenCode and Kilo use `mcp` with `"type": "local"` and `command` as one array: `["node", "/ABSOLUTE/PATH/IAF-Agent-Bridge/dist/cli.js"]`. JetBrains AI Assistant takes the same command and arguments in its MCP settings.

Do not install this server into the Cursor MCP configuration of a repository that Cursor will edit. That arrangement asks Cursor to delegate to itself. The server refuses those calls.

## Tools

| Tool | Purpose |
| --- | --- |
| `delegate` | Send a prompt, or continue a session with `sessionId`. |
| `cancel` | Cancel an in-flight turn. `force: true` kills the process after a grace period. |
| `doctor` | Runtime, Cursor CLI, authentication, and an optional ACP handshake. |

`delegate` returns JSON. The field that matters first is `result` (Cursor's reply) and `sessionId` (how to continue). The supervisor decides CONTINUE, COMPLETE, or BLOCKED. The bridge does not.

## Autonomous execution

Ordinary repository work proceeds without a person approving every tool call. The bridge answers Cursor's `session/request_permission` requests.

It rejects commands that are outside normal development:

- force push and history rewrite (`git reset --hard`, `git commit --amend`, filter-branch)
- shell `DROP` / `TRUNCATE`, unbounded `DELETE`, and data-store flushes
- recursive deletes that leave the workspace
- staging or uploading secret files such as `.env`
- piping a download into a shell

Set `IAF_PERMISSION_MODE=allow-all` only when you explicitly want that guard off. A rejection is listed in `permissionDecisions` so the supervisor can continue with a safer command or stop for authorization.

In `agent` mode, a Cursor plan request is accepted so implementation continues. In `plan` mode, the plan is captured and implementation is not started.

If Cursor asks a blocking question, the bridge records it in `cursorQuestions` and tells Cursor the supervisor will answer on the next prompt. That avoids a deadlock. The supervisor answers from the conversation when it can, and uses BLOCKED only for a real external decision.

## Sessions and project context

Follow-up work should pass the previous `sessionId`. The bridge loads that Cursor session. If the session is gone, the error is `session-not-found`. Start a new session and restate the context that turn still needs. The bridge does not silently discard the old session.

If the workspace contains `MASTER_PROMPT.md`, `PROJECT_SPEC.md`, `ENVIRONMENT.md`, `ARCHITECTURE.md`, `PLAN.md`, or `TRACEABILITY.md`, `delegate` lists them in `projectContextFiles`. The first prompt should tell Cursor to read them. Later prompts stay on the same session and do not need the full text again.

If those files do not exist, nothing is created. A normal prompt is enough.

## Commands

```shell
node dist/cli.js --version
node dist/cli.js doctor --json
node dist/cli.js doctor --deep --workspace /path/to/project
node dist/cli.js mcp
```

With no arguments the process is the MCP server. Logs go to stderr. stdout is reserved for MCP.

## Configuration

| Variable | Default |
| --- | --- |
| `IAF_CURSOR_AGENT` | discover `agent`, then `cursor-agent` |
| `IAF_CURSOR_AGENT_ARGS` | `acp` |
| `IAF_EXECUTOR` | `cursor` |
| `IAF_PERMISSION_MODE` | `autonomous` |
| `IAF_TURN_TIMEOUT_MS` | 3600000 |
| `IAF_HANDSHAKE_TIMEOUT_MS` | 30000 |
| `IAF_IDLE_TIMEOUT_MS` | 0 (disabled) |
| `IAF_LOG_LEVEL` | `warn` |

## Troubleshooting

- `cursor-not-found`: install the Cursor CLI and open a new shell so `agent` is on `PATH`.
- `auth-required`: run `agent login`, then `node dist/cli.js doctor`.
- `cursor-host-recursion`: remove this server from Cursor's own MCP config.
- A turn that stops early still has a `sessionId` when the session opened. Resume it. Do not treat a plan or a TODO list as completion.

## Development

```shell
npm test
npm run typecheck
npm run build
```

## Security

See [SECURITY.md](SECURITY.md). The bridge can edit the workspace you pass to `delegate`. Pass the project directory, not your home directory.

## License

MIT. See [LICENSE](LICENSE).
