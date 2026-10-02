# Cursor ACP

The bridge speaks the Agent Client Protocol to `agent acp`.

1. `initialize` with protocol version 1. Filesystem and terminal client capabilities are off.
2. `authenticate` with method `cursor_login`.
3. `session/new`, or `session/load` to resume. If load is missing, `session/resume` is tried once.
4. `session/set_mode` and, when asked, `session/set_model` and `session/set_config_option`.
5. `session/prompt`.
6. `session/update` notifications are collected while the prompt runs.
7. `session/request_permission` is answered on the same connection.
8. `session/cancel` asks the turn to stop. `cancel` with `force: true` kills the process after a grace period.
9. `doctor --deep` calls `session/close` when the agent accepts it, then stops the process.

Cursor extensions that block get a JSON-RPC response: `cursor/ask_question`, `cursor/create_plan`. `cursor/update_todos`, `cursor/task`, and `cursor/generate_image` are recorded. Image bytes are not copied into the MCP result.

A `cursor/ask_question` request is answered with outcome `skipped`. The question is returned in `cursorQuestions`, and the session stays open for the supervisor's next prompt. The bridge does not pause the turn to ask the person at the keyboard.

`cursor/create_plan` is accepted in agent mode so implementation continues. In plan mode the plan is recorded and implementation does not start.

`session/load` may succeed without repeating the session id. The bridge keeps the id it asked to load. A failed load does not open a new session.

Modes `agent`, `plan`, and `ask` are instructions to Cursor. They are not a sandbox.
