# Security

IAF Agent Bridge starts Cursor Agent in a directory the MCP client names. Treat `delegate` as able to read and edit that project. The person running the supervisor already has that access. The bridge adds a few boundaries of its own.

## What the bridge refuses

- Delegating while it is already the child of a Cursor agent it started (`IAF_AGENT_BRIDGE_EXECUTOR=1`).
- Delegating when the MCP client identifies itself as Cursor.
- Using the home directory or the filesystem root as `workspace`.
- Launching the agent through a shell. The executable and arguments are an argv array.
- Accepting an executable path from the tool call. `IAF_CURSOR_AGENT` is operator configuration, not model input.
- Autonomous force-push, history rewrite, shell `DROP`/`TRUNCATE`, unbounded `DELETE`, recursive deletes outside the workspace, staging or uploading secret files, and piping a download into a shell.

`IAF_PERMISSION_MODE=allow-all` turns off the command guard. Leave it unset unless you mean that.

A rejected permission is returned to the supervisor. It is not swallowed.

## What the bridge does not promise

`mode: "plan"` and `mode: "ask"` are instructions to Cursor. They are not a sandbox. Review the workspace when the task is sensitive.

Cursor may still load MCP servers configured for the target project. Do not point that configuration back at this bridge.

The bridge does not scan prompts for injection. The supervisor and Cursor both see the prompt you send.

## Secrets

Diagnostics report whether Cursor is authenticated. They do not include email, user ids, tokens, or raw `agent status` payloads.

Logs pass through redaction for common key and bearer shapes. Do not rely on redaction as the only control. Do not commit `.env` files, tokens, or private keys. The repository ignore rules exclude them.

Child processes inherit the environment so Cursor can use its existing login. The bridge does not add an API key and does not write one down.

## Protocol limits

ACP frames are capped. Collected reply text is capped and the truncation is reported. Request timeouts bound handshake calls, the whole turn, and an optional idle timer. A malformed frame increments a warning and does not terminate the server.

## Reporting

Report vulnerabilities through the private channel you use with the repository owner. Do not open a public issue that includes a working exploit, a token, or a customer payload.
