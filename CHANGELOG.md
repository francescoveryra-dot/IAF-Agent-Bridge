# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-10-03

### Fixed

- `delegate` stays open until the Cursor parent turn reaches its authoritative terminal boundary. If `session/prompt` returns a `stopReason`, that ends the turn. If it returns at acceptance without one, the bridge waits for the idle `state_update`.
- Assistant text, tool activity, and `cursor/task` notices do not finish `delegate`. A temporary count of zero known tasks does not finish it either. Parent follow-up work and respawned tasks stay inside the same turn.
- The returned text is the visible assistant output for the whole turn. Private thoughts are omitted.
- A second `delegate` for a session that is still running is rejected with `session-busy`. Other sessions can still run.
- Cancellation, an agent error, a timeout, and a disconnect are not reported as a successful completion.

## [1.0.1] - 2026-10-03

### Added

- `mcpName` `io.github.francescoveryra-dot/iaf-agent-bridge` in the npm package, so the Official MCP Registry can verify ownership of `iaf-agent-bridge`. `1.0.0` stays published without that field.

## [1.0.0] - 2026-10-02

First public release.

### Added

- Stdio MCP server with `delegate`, `cancel`, and `doctor`.
- Cursor Agent executor over ACP, including session create, session load, streaming replies, and structured results.
- Same-session continuation. A missing session is reported instead of being replaced.
- Cursor questions returned to the supervisor, and plans and todos recorded from the agent.
- Autonomous permissions that allow ordinary development and reject destructive actions. `IAF_PERMISSION_MODE=allow-all` disables that guard.
- Natural Supervisor Loop: CONTINUE, COMPLETE, and BLOCKED. CONTINUE is the default while requested work remains.
- Dynamic project context. A Master Prompt or other project document is reported when it exists and is not invented when it does not.
- Plugin and marketplace manifests for Codex, Claude Code, and Cursor, plus Copilot and generic MCP host configuration.
- Public installation from this Git repository, with doctor output that omits account identity.

Install from the Git repository:

```shell
git clone https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git
cd IAF-Agent-Bridge
npm install
npm run build
node dist/cli.js doctor
```
