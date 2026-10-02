# Compatibility baseline

Audited reference: https://github.com/andreilungeanu/cursor-delegate-mcp
Default branch `main`, tag `v2.3.0`, commit `78cadda5ced6e6f49d6af7ef6397a29cc2dce0e2`.

Statuses: PARITY, IAF-ENHANCED, INTENTIONALLY-DIFFERENT, OBSOLETE, NOT-APPLICABLE.

| Reference path | Purpose | IAF equivalent | Status |
| --- | --- | --- | --- |
| src/server.js | MCP tools delegate, cancel, doctor | src/mcp-server.ts, src/cli.ts | PARITY |
| src/delegate.js | One ACP turn and structured result | src/turn.ts | IAF-ENHANCED |
| src/acp-client.js | Child process and JSON-RPC | src/acp-client.ts, src/jsonrpc.ts | PARITY |
| src/request-router.js | Permissions and Cursor extensions | src/acp-client.ts, src/permissions.ts | IAF-ENHANCED |
| src/jsonrpc.js | Frame parsing | src/jsonrpc.ts | PARITY |
| src/spawn.js | Executable override | src/discovery.ts, src/config.ts | PARITY |
| src/proc.js | Process-tree stop | src/process-tree.ts | PARITY |
| src/doctor.js | Diagnostics | src/doctor.ts | PARITY |
| src/errors.js | Reason-coded errors | src/errors.ts | PARITY |
| src/version.js | Package version | src/version.ts | PARITY |
| src/model-options.js | Effort option matching | src/model-config.ts | PARITY |
| src/turn-state.js | Stream and tool-boundary result | src/reply.ts | PARITY |
| src/session-supervisor.js | Idle and hard-cap timers | src/turn.ts | PARITY |
| src/agent-reported-files.js | Paths from ACP diffs | src/turn.ts | PARITY |
| src/acp-enums.js | Plan and todo statuses | src/types.ts | PARITY |
| skills/delegate/SKILL.md | How the host delegates | skills/iaf-agent-bridge/SKILL.md | INTENTIONALLY-DIFFERENT |
| skills/delegate/reference.md | Field reference | skills/iaf-agent-bridge/reference.md | PARITY |
| commands/delegate.md | Slash command | commands/delegate.md, commands/doctor.md, commands/cancel.md | IAF-ENHANCED |
| .codex-plugin/plugin.json | Codex plugin | .codex-plugin/plugin.json | PARITY |
| .agents/plugins/marketplace.json | Codex marketplace catalog | .agents/plugins/marketplace.json | PARITY |
| .claude-plugin/plugin.json | Claude plugin | .claude-plugin/plugin.json | PARITY |
| .claude-plugin/mcp.json | Claude MCP command | .claude-plugin/mcp.json | PARITY |
| .claude-plugin/marketplace.json | Claude marketplace | .claude-plugin/marketplace.json | PARITY |
| .claude-plugin/hooks.json | SessionStart install | .claude-plugin/hooks.json | PARITY |
| .claude-plugin/ensure-deps.mjs | Install and build when missing | .claude-plugin/ensure-deps.mjs | PARITY |
| .github/plugin/marketplace.json | Copilot marketplace | .github/plugin/marketplace.json | PARITY |
| .mcp.copilot.json | Copilot MCP command | .mcp.copilot.json | PARITY |
| plugin.json | Shared plugin manifest | plugin.json | PARITY |
| server.json | MCP registry descriptor | server.json | INTENTIONALLY-DIFFERENT |
| glama.json | Directory metadata | glama.json | PARITY |
| .github/workflows/test.yml | CI | .github/workflows/test.yml | PARITY |
| .github/workflows/release.yml | Release automation | .github/workflows/release.yml | INTENTIONALLY-DIFFERENT |
| .github/dependabot.yml | Dependency updates | .github/dependabot.yml | PARITY |
| .github/ISSUE_TEMPLATE/* | Issue forms | .github/ISSUE_TEMPLATE/* | PARITY |
| README.md TECHNICAL.md SECURITY.md PRIVACY.md TERMS.md CONTRIBUTING.md CHANGELOG.md LICENSE llms-install.md | Docs | same names plus CONFIGURATION.md and RELEASING.md | IAF-ENHANCED |
| assets/* | Logos | assets/logo.svg | INTENTIONALLY-DIFFERENT |
| test/* | Automated checks | test/* | PARITY |
| scripts/run-tests.mjs | Test runner | package.json test script | PARITY |
| test/npm-package-smoke.mjs | Packed package check | scripts/package-smoke.mjs | PARITY |
| .cursor-plugin | Not in the reference | .cursor-plugin/*, rules/no-self-delegation.mdc | IAF-ENHANCED |

## Behavioral notes

- Missing sessions return `session-not-found`. The bridge does not open a silent replacement session.
- Permissions are autonomous and reject destructive commands. `IAF_PERMISSION_MODE=allow-all` disables that guard.
- The skill uses CONTINUE, COMPLETE, and BLOCKED. It does not require a review pass after every turn.
- `server.json` does not list an npm package because the package is not published.
- The release workflow creates a GitHub release only when someone runs it and sets `create_github_release`. It does not publish to npm.
- Logos are an original mark, not the reference artwork.
- A blocking Cursor question is answered with `skipped` and returned in `cursorQuestions`. The session stays open for the supervisor's next prompt. An in-call elicitation would ask the person at the keyboard, which this product does not do.
- `doctor --deep` opens a session, calls `session/close` when the agent accepts it, and then stops the process.
