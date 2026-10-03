# IAF Agent Bridge

MCP server that lets Codex, Claude Code, or another stdio host send work to Cursor Agent and continue the **same Cursor session** until the requested work is done.

The bridge carries the prompt, the session, and Cursor's reply. The supervisor decides what happens next. Cursor does the implementation.

**Status:** [npm `iaf-agent-bridge@1.0.1`](https://www.npmjs.com/package/iaf-agent-bridge) is the current public package. [GitHub Release v1.0.1](https://github.com/francescoveryra-dot/IAF-Agent-Bridge/releases/tag/v1.0.1) matches it. [v1.0.0](https://github.com/francescoveryra-dot/IAF-Agent-Bridge/releases/tag/v1.0.0) remains published. The Official MCP Registry entry is [`io.github.francescoveryra-dot/iaf-agent-bridge`](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.francescoveryra-dot%2Fiaf-agent-bridge/versions/latest) version `1.0.1`.

[![CI](https://github.com/francescoveryra-dot/IAF-Agent-Bridge/actions/workflows/test.yml/badge.svg)](https://github.com/francescoveryra-dot/IAF-Agent-Bridge/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/iaf-agent-bridge)](https://www.npmjs.com/package/iaf-agent-bridge)
[![GitHub Release](https://img.shields.io/github/v/release/francescoveryra-dot/IAF-Agent-Bridge)](https://github.com/francescoveryra-dot/IAF-Agent-Bridge/releases/tag/v1.0.1)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

```
Supervisor (Codex, Claude Code, or another MCP host)
        |
        | MCP over stdio
        v
IAF Agent Bridge
        |
        | ACP over stdio
        v
Cursor Agent
        |
        v
Your repository
```

Cursor Agent is the only production executor. Codex and Claude Code are supervisors. Do not install this server into the Cursor MCP config of a repository that Cursor itself is editing. That loop is refused.

## What you can do

- Start a Cursor session from an MCP host and resume it with `sessionId`.
- Let ordinary development continue without approving every tool call.
- Reject force-push, history rewrite, destructive SQL, deletes outside the project, and secret staging unless you explicitly set `IAF_PERMISSION_MODE=allow-all`.
- Use a Master Prompt when the repository has one. A repository without one works normally.

## Prerequisites

- Node.js 20 or newer. Running the test suite needs Node.js 22.
- The [Cursor CLI](https://cursor.com/docs/cli/overview) on your `PATH` as `agent`.
- `agent login` completed on that machine.

No OpenAI API key is required.

## Install

| Channel | Status | How |
| --- | --- | --- |
| npm | AVAILABLE | `npx -y iaf-agent-bridge@1.0.1` |
| Official MCP Registry | AVAILABLE | [`io.github.francescoveryra-dot/iaf-agent-bridge` 1.0.1](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.francescoveryra-dot%2Fiaf-agent-bridge/versions/1.0.1) |
| Cursor plugin | DIRECT INSTALL AVAILABLE | `agent plugin marketplace add https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git` |
| Cursor Marketplace | NOT LISTED | Sign in at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish), then submit this repository. Review is manual. |
| Claude Code | DIRECT INSTALL AVAILABLE | `claude plugin marketplace add francescoveryra-dot/IAF-Agent-Bridge` then `claude plugin install iaf-agent-bridge@iaf-agent-bridge` |
| GitHub Copilot CLI | DIRECT INSTALL AVAILABLE | `copilot plugin marketplace add francescoveryra-dot/IAF-Agent-Bridge` then `copilot plugin install iaf-agent-bridge@iaf-agent-bridge` |
| Codex / ChatGPT GitHub plugin | DIRECT INSTALL AVAILABLE | `codex plugin marketplace add https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git --ref main` then `codex plugin add iaf-agent-bridge@iaf-agent-bridge` |
| OpenAI plugin directory | NOT APPLICABLE for this local server | The public directory reviews a hosted HTTPS MCP endpoint. This bridge runs on your machine and talks to your local Cursor CLI. |
| VS Code MCP gallery | NOT LISTED | VS Code browses the GitHub MCP registry. This server is in the Official MCP Registry and is not in that gallery. Add it with `npx -y iaf-agent-bridge`. |

Manual MCP configuration remains the fallback. See [docs/installation.md](docs/installation.md) and [docs/hosts.md](docs/hosts.md).

## Quick start

```shell
git clone https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git
cd IAF-Agent-Bridge
npm install
npm run build
node dist/cli.js doctor
```

`doctor` should show the Cursor executable and `Authenticated: true`. It does not print your account.

Point an MCP host at the published package:

```text
command: npx
args:    ["-y", "iaf-agent-bridge@1.0.1"]
```

A source checkout can use `node` and `dist/cli.js` after `npm run build`. Then ask the supervisor to implement the work with Cursor and to call `delegate` again with the returned `sessionId` while requested work remains.

## Install by host

| Host | How | Detail |
| --- | --- | --- |
| Codex | Plugin manifest in this repo, or `config.toml` | [docs/hosts.md](docs/hosts.md) |
| Claude Code | `claude mcp add` or the plugin in `.claude-plugin/` | [docs/hosts.md](docs/hosts.md) |
| Cursor | Plugin manifest for marketplace submission. Do not use it to delegate from Cursor to Cursor. | [docs/marketplaces.md](docs/marketplaces.md) |
| Any stdio MCP client | `node` + `dist/cli.js` | [docs/installation.md](docs/installation.md) |

npm install (`npx -y iaf-agent-bridge`) installs `1.0.1`. See [docs/installation.md](docs/installation.md) and [docs/release.md](docs/release.md).

## Tools

| Tool | Use |
| --- | --- |
| `delegate` | Send a prompt. Pass `sessionId` to continue the same Cursor conversation. |
| `cancel` | Stop an in-flight turn. The session can still be resumed. |
| `doctor` | Check Node, the bridge, the Cursor CLI, and authentication. |

Example follow-up: the first `delegate` returns `"sessionId": "..."`. The next call uses that id and a prompt that names what is still missing.

## How the supervisor should behave

Read `result` as if you had pasted Cursor's reply into the conversation. Then choose one state:

- **CONTINUE** when requested work remains and Cursor can still do it. This is the normal result. Plans, TODOs, mocks, and missing layers are CONTINUE.
- **COMPLETE** when the requested work is actually present.
- **BLOCKED** only for a real external decision, secret, or irreversible authorization.

The bridge does not demand a new lint run, end-to-end suite, or coverage gate after every turn. Details: [docs/supervisor-loop.md](docs/supervisor-loop.md).

If the repository contains `MASTER_PROMPT.md` or the other project files listed in [docs/supervisor-loop.md](docs/supervisor-loop.md), the first result names them. If it does not, nothing is created.

## Configuration and troubleshooting

Environment variables: [docs/configuration.md](docs/configuration.md).

If `doctor` says Cursor was not found, install the CLI and open a new shell. If it says not authenticated, run `agent login`. More cases: [docs/troubleshooting.md](docs/troubleshooting.md).

## Security

The bridge can ask Cursor to edit the workspace you name and to run commands there. Read [SECURITY.md](SECURITY.md) and [docs/security-model.md](docs/security-model.md).

Report vulnerabilities privately: [Security advisories](https://github.com/francescoveryra-dot/IAF-Agent-Bridge/security/advisories/new). Do not open a public issue that contains a token, a credential, or a working exploit.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests are welcome. Support routes are in [SUPPORT.md](SUPPORT.md).

## License

MIT. See [LICENSE](LICENSE).
