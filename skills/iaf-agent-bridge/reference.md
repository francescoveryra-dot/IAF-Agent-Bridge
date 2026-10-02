# IAF Agent Bridge reference

The bridge transports a prompt to Cursor and returns Cursor's reply. You decide CONTINUE, COMPLETE, or BLOCKED. The bridge does not make that decision.

## delegate

| Field | Required | Meaning |
| --- | --- | --- |
| `prompt` | yes | Sent to Cursor as written. |
| `workspace` | yes | Existing project directory. Not the home directory and not the filesystem root. |
| `sessionId` | no | Resume this Cursor session. Omit on the first turn. |
| `mode` | no | `agent` (default), `plan`, or `ask`. An instruction to Cursor, not a sandbox. |
| `model` | no | Cursor model id. Omit to keep Cursor's default. |
| `fast` | no | `true` requests the fast tier. Default `false`. |
| `effort` | no | Exact effort token the model advertises. An invalid value fails before the prompt. |
| `context` | no | Context-window option when the model has one. |
| `contextFiles` | no | Paths to attach. Missing paths become warnings. |

`plan` captures the plan and does not ask Cursor to start implementing inside that turn. `agent` accepts an implementation plan so Cursor can keep working.

## Result

The tool returns one JSON object in a text block.

| Field | Meaning |
| --- | --- |
| `sessionId` | Pass this back to continue the same conversation. |
| `resumed` | True when this turn loaded an existing session. |
| `result` | Cursor's reply. Read it as a pasted answer. |
| `resultSource` | `pre-tool-fallback` when the only text arrived before tools and no final answer followed. |
| `stopReason` | Cursor's ACP stop reason when it sent one. |
| `projectContextFiles` | Authoritative project files found at the workspace root, only when they exist. |
| `filesReportedByEditTools` | Paths Cursor's edit tools reported. The git diff remains the workspace record. |
| `plan` | Plan text captured from Cursor. |
| `todos` / `todoProgress` | Todo state Cursor reported. Absence means nothing. Unfinished requested work is still CONTINUE. |
| `cursorQuestions` | Questions Cursor asked. Answer them on the same session when you can. |
| `permissionDecisions` | Allow or reject decisions for this turn. A reject is reported, not hidden. |
| `protocolWarnings` | Non-fatal protocol issues. |
| `cancelRequested` | The turn was cancelled. |
| `effectiveModel` | Present when Cursor served a different model than requested. |

## Errors

Failures use `delegate failed [reason]: ...`.

| Reason | What to do |
| --- | --- |
| `invalid-workspace` | Pass an existing project directory. |
| `cursor-not-found` | Install the Cursor CLI and put `agent` on PATH. |
| `auth-required` | Run `agent login`. |
| `session-not-found` | Start a new session and restate the needed context. |
| `invalid-model` | Use a model id Cursor accepts, or omit `model`. |
| `turn-timeout` / `idle-timeout` | Resume `sessionId` if the message includes one. |
| `agent-exit` | Read the message. Resume the session when Cursor had already opened one. |
| `recursive-delegation` / `cursor-host-recursion` | You are inside Cursor. Implement directly. |
| `invalid-config` | Fix the named environment variable. |

## cancel

| Status | Meaning |
| --- | --- |
| `cancelled` | `session/cancel` was sent. The turn may still finish. |
| `killed` | `force: true` and the process exited. |
| `not-running` | The turn already ended. The session can still be resumed. |
| `not-found` | This bridge process has not seen that id. |

## doctor

`deep: true` starts Cursor, authenticates, and opens an empty session. It does not send a prompt. Account details are not included.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `IAF_CURSOR_AGENT` | discover `agent`, then `cursor-agent` | Executable path. No shell. |
| `IAF_CURSOR_AGENT_ARGS` | `acp` | Arguments. `acp` is appended when missing. |
| `IAF_EXECUTOR` | `cursor` | Only `cursor` is available. |
| `IAF_PERMISSION_MODE` | `autonomous` | `allow-all` disables the destructive-action guard. |
| `IAF_TURN_TIMEOUT_MS` | `3600000` | Whole turn limit. Minimum 1000. |
| `IAF_HANDSHAKE_TIMEOUT_MS` | `30000` | Each handshake RPC. |
| `IAF_IDLE_TIMEOUT_MS` | `0` | `0` disables the idle timer. |
| `IAF_LOG_LEVEL` | `warn` | `debug`, `info`, `warn`, `error`, `silent`. Logs go to stderr. |

No API key is required for the bridge. Cursor uses its own login.
