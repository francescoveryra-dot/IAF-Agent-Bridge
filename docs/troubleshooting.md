# Troubleshooting

| What you see | What to do |
| --- | --- |
| `cursor-not-found` | Install the Cursor CLI. Open a new shell so `agent` is on `PATH`. Or set `IAF_CURSOR_AGENT` to the executable. |
| `auth-required` | Run `agent login`, then `node dist/cli.js doctor`. |
| `invalid-workspace` | Pass an existing project directory. Home and the filesystem root are rejected. |
| `session-not-found` | Start a new session and restate the context that turn still needs. |
| `invalid-model` or `invalid-effort` | Omit the field or use a value Cursor listed. |
| `cursor-host-recursion` | You are Cursor. Implement the task directly. Remove this server from that project's MCP config. |
| `turn-timeout` | Resume `sessionId` if the message includes one. Raise `IAF_TURN_TIMEOUT_MS` if the task is long. |
| Doctor prints `Authenticated: false` | Run `agent login`. |
| The host cannot see the tools | Restart the host after changing its MCP config. Confirm `node dist/cli.js --version` prints `1.0.0`. |

`node dist/cli.js doctor --json` is safe to paste into an issue after you remove anything that looks like a token. The command itself does not include your Cursor account email.
