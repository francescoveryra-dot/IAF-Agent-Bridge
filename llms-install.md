# Install IAF Agent Bridge

1. Clone `git@github.com:francescoveryra-dot/IAF-Agent-Bridge.git`.
2. `npm install` and `npm run build`.
3. Confirm `node dist/cli.js doctor` shows Cursor as authenticated.
4. Point the MCP host at `node` with args `["/absolute/path/IAF-Agent-Bridge/dist/cli.js"]`.
5. For Codex, use `[mcp_servers.iaf-agent-bridge]` in `~/.codex/config.toml`. No OpenAI API key is required for the bridge.
6. For Personal Private ChatGPT, run `npx iaf-agent-bridge setup chatgpt --project my-project=/absolute/path` and then `npx iaf-agent-bridge chatgpt`. Each user creates their own Secure MCP Tunnel. IAF does not host the content path. `delegate` requires that the ChatGPT workspace expose Full MCP write tools.
7. Ask the supervisor to implement the request with Cursor and to continue the same `sessionId` until the requested work is complete.

Do not add this server to Cursor's MCP configuration for the repository Cursor is editing.
