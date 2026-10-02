# Technical notes

IAF Agent Bridge is a Node.js MCP server. It speaks newline-delimited JSON-RPC to MCP on its own stdio, and a second newline-delimited JSON-RPC session to a child `agent acp` process. Application logs go to stderr.

## Modules

| Path | Role |
| --- | --- |
| `src/cli.ts` | `mcp`, `doctor`, and `--version`. |
| `src/mcp-server.ts` | Tools `delegate`, `cancel`, and `doctor`. |
| `src/executor.ts` | Cursor executor registry. V1 registers only Cursor. |
| `src/turn.ts` | One delegation: spawn, handshake, prompt, structured result. |
| `src/acp-client.ts` | Cursor ACP session and extension methods. |
| `src/jsonrpc.ts` | Framing, request correlation, malformed-frame handling. |
| `src/permissions.ts` | Autonomous allow/reject policy. |
| `src/discovery.ts` | Cursor executable lookup and version probe. |
| `src/doctor.ts` | Diagnostics. Authentication output is a boolean, not an account record. |
| `src/config.ts` | Environment configuration. |
| `src/workspace.ts` | Workspace checks. |
| `src/context-files.ts` | Optional project-document discovery. |

## ACP flow

The client follows the current Cursor CLI ACP documentation:

1. `initialize` with protocol version 1 and no filesystem or terminal capabilities.
2. `authenticate` with `methodId: "cursor_login"`.
3. `session/new`, or `session/load` to resume. If `session/load` is missing, `session/resume` is tried once.
4. `session/set_mode` and, when asked, `session/set_model`.
5. `session/prompt` with a single text block.
6. `session/update` notifications are collected while the prompt is in flight.
7. `session/request_permission` is answered on the same connection.
8. `session/cancel` is a notification. `force` on the cancel tool kills the child process group.

Blocking Cursor extensions `cursor/ask_question` and `cursor/create_plan` receive a JSON-RPC response. `cursor/update_todos`, `cursor/task`, and `cursor/generate_image` are recorded. Image bytes are not copied into the MCP result.

A failed `session/load` does not open a replacement session. The supervisor gets `session-not-found` and can start a new session with the context that turn needs.

## Process lifecycle

Each `delegate` call starts one `agent acp` process, in its own process group on POSIX. The MCP server tracks it until the prompt returns, the caller cancels, the idle or turn timer fires, or the MCP server itself shuts down. Shutdown also runs on stdin EOF, SIGINT, and SIGTERM.

Stdout of the child is protocol. Stderr is retained, capped, and redacted before it is placed in an error.

## Executor boundary

`CursorExecutor` is the only production implementation of `CodingExecutor`. `resolveExecutor` rejects any other id. `IAF_EXECUTOR` must be `cursor`.

## Compatibility notes

Material differences from other Cursor delegation bridges are recorded in [docs/intentional-differences.md](docs/intentional-differences.md). A file-by-file baseline used while building V1 is in [docs/compatibility-baseline.md](docs/compatibility-baseline.md).
