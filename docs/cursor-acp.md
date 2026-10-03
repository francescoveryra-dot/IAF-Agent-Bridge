# Cursor ACP

The bridge speaks the Agent Client Protocol to `agent acp`.

1. `initialize` with protocol version 1. Filesystem and terminal client capabilities are off.
2. `authenticate` with method `cursor_login`.
3. `session/new`, or `session/load` to resume. If load is missing, `session/resume` is tried once.
4. `session/set_mode` and, when asked, `session/set_model` and `session/set_config_option`.
5. `session/prompt`.
6. `session/update` notifications are collected while the prompt runs. They do not finish the turn.
7. `session/request_permission` is answered on the same connection.
8. `session/cancel` asks the turn to stop. `cancel` with `force: true` kills the process after a grace period.
9. `doctor --deep` calls `session/close` when the agent accepts it, then stops the process.

`delegate` stays open until the Cursor parent turn is terminal. On the Cursor CLI checked for this bridge (`2026.10.01`, ACP `protocolVersion` 1), that signal is the `session/prompt` result `stopReason`. The current ACP specification also allows `session/prompt` to return as soon as the prompt is accepted, and then to report completion with `session/update` `state_update` `state: "idle"`. If the prompt result has no `stopReason`, the bridge waits for that idle update. Assistant text, tool updates, and `cursor/task` notices do not finish the turn. A count of zero known tasks does not finish it either. `cancelled` and `error` are terminal failures, not a successful reply.

Cursor's published ACP page describes `cursor/task` as a notification that a subagent task started or finished. The bridge records that notice and does not run the subagent. Cursor remains in charge of its own sub-agents, reviews, and follow-up work.

Official references used for this behavior: [Cursor CLI ACP](https://cursor.com/docs/cli/acp) and [ACP prompt lifecycle](https://agentclientprotocol.com/protocol/v2/prompt-lifecycle).

Cursor extensions that block get a JSON-RPC response: `cursor/ask_question`, `cursor/create_plan`. `cursor/update_todos`, `cursor/task`, and `cursor/generate_image` are recorded. Image bytes are not copied into the MCP result.

A `cursor/ask_question` request is answered with outcome `skipped`. The question is returned in `cursorQuestions`, and the session stays open for the supervisor's next prompt. The bridge does not pause the turn to ask the person at the keyboard.

`cursor/create_plan` is accepted in agent mode so implementation continues. In plan mode the plan is recorded and implementation does not start.

`session/load` may succeed without repeating the session id. The bridge keeps the id it asked to load. A failed load does not open a new session.

Modes `agent`, `plan`, and `ask` are instructions to Cursor. They are not a sandbox.
