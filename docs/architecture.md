# Architecture

```
MCP host
  stdio JSON-RPC
IAF Agent Bridge
  stdio JSON-RPC (ACP)
Cursor Agent (`agent acp`)
  edits and commands
Workspace directory
```

| Module | Role |
| --- | --- |
| `src/cli.ts` | `mcp`, `doctor`, `--version` |
| `src/mcp-server.ts` | Tools |
| `src/executor.ts` | Cursor is the only production executor |
| `src/turn.ts` | One prompt, one result |
| `src/acp-client.ts` | Cursor ACP session |
| `src/permissions.ts` | Allow or reject a permission request |
| `src/discovery.ts` | Find the Cursor executable |

Logs go to stderr. stdout is the MCP protocol when the process is a server.

A future executor would register beside Cursor. V1 does not ship a second one.
