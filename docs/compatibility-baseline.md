# Compatibility baseline

This note records how the public Cursor delegation baseline mapped onto IAF Agent Bridge while V1 was built. It is not a runtime dependency.

| Baseline area | Observable behavior | IAF path | Status |
| --- | --- | --- | --- |
| MCP stdio server | Host launches one Node process. Logs stay off stdout. | `src/cli.ts`, `src/mcp-server.ts` | Implemented |
| delegate tool | Send work and receive a structured result with a session id. | `delegate` | Implemented, prompt field instead of a brief schema |
| resume | Continue a Cursor session. | `sessionId` plus `session/load` | Implemented, missing sessions error |
| cancel | Stop an in-flight turn, with a force option. | `cancel` | Implemented |
| doctor | Version, binary, handshake. | `doctor` | Implemented, auth is boolean only |
| ACP initialize / authenticate / session/new / session/prompt | Cursor's documented flow. | `src/acp-client.ts` | Implemented |
| session/update streaming | Collect agent text. | `src/turn.ts` | Implemented |
| session/request_permission | Answer allow or reject. | `src/permissions.ts` | Implemented with a destructive-action guard |
| cursor/ask_question, cursor/create_plan | Blocking extensions. | `src/acp-client.ts` | Implemented |
| cursor/update_todos, cursor/task, cursor/generate_image | Notifications. | `src/acp-client.ts` | Recorded, image bytes omitted |
| Supervisor instructions | How the host uses the tools. | `skills/iaf-agent-bridge/` | Original loop: CONTINUE / COMPLETE / BLOCKED |
| Codex, Claude, Copilot packaging | Plugin manifests. | `.codex-plugin`, `.claude-plugin`, `plugin.json` | Local `node dist/cli.js`, not a published npm id |
| Future executors | Not in the baseline as a second runtime. | `src/executor.ts` | Registry only; Cursor is production |
