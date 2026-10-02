# Contributing

## Setup

```shell
git clone https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git
cd IAF-Agent-Bridge
npm ci
npm test
npm run typecheck
npm run build
```

Node.js 22 is required for `npm test`. The compiled CLI runs on Node.js 20 or newer. Unit tests do not need the Cursor CLI.

## Layout

`src/mcp-server.ts` is the MCP surface. `src/turn.ts` runs one Cursor turn. `src/acp-client.ts` speaks ACP. `src/executor.ts` is where another executor would register. V1 only registers Cursor.

## Tests

| Command | Needs |
| --- | --- |
| `npm test` | Node.js 22 |
| `node dist/cli.js doctor` | Cursor CLI |
| `node scripts/acceptance.mjs` | Cursor CLI and `agent login` |
| `claude plugin validate --strict .claude-plugin/plugin.json` | Claude Code CLI |

## Changing the bridge

- MCP tool changes belong in `src/mcp-server.ts` and `skills/iaf-agent-bridge/`.
- ACP changes belong in `src/acp-client.ts`. Check [Cursor's ACP docs](https://cursor.com/docs/cli/acp) before assuming an old method.
- Do not add a second production executor until it can complete a real session.
- Keep CONTINUE as the supervisor default. Do not add a mandatory lint or end-to-end gate to the skill.
- Plugin manifests must use portable paths. Do not commit a home-directory path.

## Security

Do not open a public issue for a vulnerability. Use the private advisory linked from [SECURITY.md](SECURITY.md).

## Pull requests

Describe why the change exists and how you tested it. The maintainer reviews `main`. Do not force-push `main`.

## Releases

Publishing to npm and cutting a GitHub Release are maintainer actions. See [docs/release.md](docs/release.md).
