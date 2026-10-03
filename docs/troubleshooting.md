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
| The host cannot see the tools | Restart the host after changing its MCP config. `iaf-agent-bridge --version` prints the installed package version. |
| `unknown-project` | The alias was not approved. Run `setup chatgpt --project name=/absolute/project` again. |
| `workspace-changed` | The approved directory was replaced or retargeted. Approve the real directory again. |
| ChatGPT cannot see the app | Developer mode must be on, `iaf-agent-bridge chatgpt` must be running, and `tunnel-client` must be polling the same tunnel. |
| `delegate` is refused as read-only | OpenAI's own pages disagree about Plus/Pro write tools. Do not relabel the tool. Use a plan that allows write MCP, or stay on the local stdio hosts. |
| Tunnel tool call ends near 10 minutes | `tunnel-client` defaults `MCP_CONNECTION_MAX_TTL` to 10 minutes. That limit is in the tunnel client, not an IAF relay. |

`node dist/cli.js doctor --json` is safe to paste into an issue after you remove anything that looks like a token. The command itself does not include your Cursor account email.
