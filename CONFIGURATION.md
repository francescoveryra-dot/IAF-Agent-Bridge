# Configuration

IAF Agent Bridge reads configuration from the environment. Tool arguments never select the executable.

| Variable | Default | Meaning |
| --- | --- | --- |
| `IAF_CURSOR_AGENT` | discover `agent`, then `cursor-agent`, then `~/.local/bin/agent` | Absolute or executable path. No shell. |
| `IAF_CURSOR_AGENT_ARGS` | `acp` | Extra arguments. `acp` is appended when it is missing. |
| `IAF_EXECUTOR` | `cursor` | Only `cursor` is available. |
| `IAF_PERMISSION_MODE` | `autonomous` | `allow-all` disables the destructive-action guard. |
| `IAF_TURN_TIMEOUT_MS` | `3600000` | Limit for one delegate call. Minimum 1000. |
| `IAF_HANDSHAKE_TIMEOUT_MS` | `30000` | Limit for each handshake RPC. |
| `IAF_IDLE_TIMEOUT_MS` | `0` | Silence limit. `0` disables it. |
| `IAF_LOG_LEVEL` | `warn` | `debug`, `info`, `warn`, `error`, or `silent`. Stderr only. |
| `IAF_VERSION_PROBE_TIMEOUT_MS` | `10000` | `doctor` version and auth probes. |
| `IAF_FORCE_GRACE_MS` | `5000` | Wait after `cancel` with `force` before killing the process. |

`delegate` also accepts `model`, `fast`, `effort`, `context`, and `contextFiles`. Omit them unless the user asked. `effort` must be a value the selected model advertised. A bad value fails before the prompt.

No API key is required. Cursor uses `agent login`.
