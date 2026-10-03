# Install IAF Agent Bridge

1. Clone `git@github.com:francescoveryra-dot/IAF-Agent-Bridge.git`.
2. `npm install` and `npm run build`.
3. Confirm `node dist/cli.js doctor` shows Cursor as authenticated.
4. Point the MCP host at `node` with args `["/absolute/path/IAF-Agent-Bridge/dist/cli.js"]`.
5. For Codex, use `[mcp_servers.iaf-agent-bridge]` in `~/.codex/config.toml`. No OpenAI API key is required for the bridge.
6. For normal ChatGPT Chat, use `setup chatgpt` and `chatgpt` from this source tree with the user's own Secure MCP Tunnel. That mode is not in npm `1.0.2`. IAF does not host the content path.
7. Ask the supervisor to implement the request with Cursor and to continue the same `sessionId` until the requested work is complete.

Do not add this server to Cursor's MCP configuration for the repository Cursor is editing.
