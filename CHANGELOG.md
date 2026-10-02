# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Stdio MCP server with `delegate`, `cancel`, and `doctor`.
- Cursor Agent executor over ACP, including session create and load, streaming, permissions, cancellation, and Cursor's plan and question methods.
- Autonomous permission policy that rejects destructive commands. `allow-all` disables that guard.
- Supervisor skill for CONTINUE, COMPLETE, and BLOCKED on the same Cursor session.
- Model effort, fast tier, context window, and context-file attachments.
- Plugin and marketplace manifests for Codex, Claude Code, Cursor, and Copilot.
- Public docs, security policy, and a manual release workflow that does not publish to npm.

No GitHub Release or npm publication has been made.
