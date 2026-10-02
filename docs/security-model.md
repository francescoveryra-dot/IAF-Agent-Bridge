# Security model

```
MCP host
  tool arguments and environment
IAF Agent Bridge
  argv spawn, no shell
Cursor Agent
  workspace plus the commands Cursor chooses
```

## Controls

- The executable comes from `IAF_CURSOR_AGENT` or PATH discovery, never from a tool argument.
- Arguments are an array. The process is not started with a shell.
- `workspace` must be an existing directory. After symlink resolution it must not be the home directory or the filesystem root.
- In `autonomous` mode the bridge rejects force-push, `git reset --hard`, `git commit --amend`, history filters, shell `DROP`/`TRUNCATE`, `DELETE` without `WHERE`, `FLUSHALL`/`FLUSHDB`, `git clean -x`, recursive deletes that leave the workspace or use `..`, staging a secret file such as `.env`, and piping a download into a shell.
- `IAF_PERMISSION_MODE=allow-all` turns those rejections off. Set it only when you mean that.
- A Cursor-identified MCP client, and a process already marked `IAF_AGENT_BRIDGE_EXECUTOR=1`, cannot call `delegate`.
- ACP lines are capped. Reply text is capped. Handshake, turn, and optional idle timers bound a call.
- Doctor output is an authentication boolean. Account email and tokens are not copied into it.
- Logs pass through redaction. Redaction is not a guarantee.

## Residual risk

Cursor can still edit anything the operating system allows inside the workspace, and a command that does not match the patterns above can still run. `plan` and `ask` do not confine the agent. A hostile repository can contain instructions Cursor will read. The child inherits the environment so the Cursor login works; do not put unrelated secrets in that environment if you can avoid it.

The Claude plugin hook `.claude-plugin/ensure-deps.mjs` runs `npm install` and `npm run build` on session start when `dist/cli.js` or dependencies are missing. That executes npm in the plugin directory. It does not download a shell script. Review the clone before you enable the plugin.
