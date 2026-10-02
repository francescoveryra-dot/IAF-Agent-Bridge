# Configuration

The bridge reads the environment. A tool call cannot choose the executable.

| Variable | Default | Meaning |
| --- | --- | --- |
| `IAF_CURSOR_AGENT` | `agent`, then `cursor-agent`, then `~/.local/bin/agent` | Executable path. Spawned without a shell. |
| `IAF_CURSOR_AGENT_ARGS` | `acp` | Arguments. `acp` is appended when missing. |
| `IAF_EXECUTOR` | `cursor` | Only `cursor` is available. |
| `IAF_PERMISSION_MODE` | `autonomous` | `allow-all` disables the destructive-action guard. |
| `IAF_TURN_TIMEOUT_MS` | `3600000` | Limit for one `delegate` call. Minimum 1000. |
| `IAF_HANDSHAKE_TIMEOUT_MS` | `30000` | Limit for each handshake call. |
| `IAF_IDLE_TIMEOUT_MS` | `0` | Silence limit. `0` disables it. |
| `IAF_LOG_LEVEL` | `warn` | `debug`, `info`, `warn`, `error`, or `silent`. Stderr only. |
| `IAF_VERSION_PROBE_TIMEOUT_MS` | `10000` | Doctor version and auth probes. |
| `IAF_FORCE_GRACE_MS` | `5000` | Wait after `cancel` with `force` before the process is killed. |

`delegate` also accepts `model`, `fast`, `effort`, `context`, and `contextFiles`. Leave them unset unless you asked for them. An unknown `effort` value fails before the prompt and lists the values Cursor advertised.

No API key is stored or required by this project. Cursor uses `agent login`.
