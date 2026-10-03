# Hosts

One stdio server. The host configuration changes. Replace `CLONE` with the absolute path of your clone.

## Codex

The Codex plugin starts `node` with `./bin/iaf-agent-bridge.mjs` and `"cwd": "."`. Codex resolves that working directory from the plugin checkout, not from the project you are editing. The launcher builds `dist/cli.js` when it is missing, then runs the MCP server. A marketplace install does not contain `dist/` because the build output is not committed.

A manual server entry can use the same launcher, or `dist/cli.js` after you have already built the clone:

```toml
[mcp_servers.iaf-agent-bridge]
command = "node"
args = ["CLONE/bin/iaf-agent-bridge.mjs"]
```

## Claude Code

```shell
claude mcp add iaf-agent-bridge -- node CLONE/dist/cli.js
```

Or add this repository as a local marketplace. See [marketplaces.md](marketplaces.md).

## Generic MCP

```json
{
  "mcpServers": {
    "iaf-agent-bridge": {
      "command": "node",
      "args": ["CLONE/dist/cli.js"]
    }
  }
}
```

VS Code browses the GitHub MCP registry (`api.mcp.github.com`), not the Official MCP Registry directly. This server is published in the Official MCP Registry and is not listed in the GitHub gallery. Install the published package instead:

```json
{
  "servers": {
    "iaf-agent-bridge": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "iaf-agent-bridge@1.0.1"]
    }
  }
}
```

That is `.vscode/mcp.json` for a workspace, or the user MCP configuration. No VS Code extension is required. Visual Studio uses the same `servers` shape. Zed uses `context_servers`. OpenCode and Kilo use `mcp` with `"type": "local"` and `command` as one array. Windsurf uses `~/.codeium/windsurf/mcp_config.json`. Antigravity uses `~/.gemini/config/mcp_config.json`. Kiro uses `.kiro/settings/mcp.json`. JetBrains AI Assistant takes the same command and arguments in its MCP settings.

Those shapes match each product's documented configuration. They were not launched in this repository's test environment.

## Cursor as a host

Do not add this server to the MCP configuration of a project Cursor is editing. `.cursor-plugin/` exists so the plugin can be submitted. The server refuses `delegate` when the client identifies itself as Cursor. The rule in `rules/no-self-delegation.mdc` says the same thing.
