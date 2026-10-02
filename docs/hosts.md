# Hosts

One stdio server. The host configuration changes. Replace `CLONE` with the absolute path of your clone.

## Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.iaf-agent-bridge]
command = "node"
args = ["CLONE/dist/cli.js"]
```

The Codex CLI was not available in the development environment, so this block follows Codex's config reference and was not executed there. The plugin files are `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json`.

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

VS Code and Visual Studio use a top-level `servers` object and `"type": "stdio"`. Zed uses `context_servers`. OpenCode and Kilo use `mcp` with `"type": "local"` and `command` as one array. Windsurf uses `~/.codeium/windsurf/mcp_config.json`. Antigravity uses `~/.gemini/config/mcp_config.json`. Kiro uses `.kiro/settings/mcp.json`. JetBrains AI Assistant takes the same command and arguments in its MCP settings.

Those shapes match each product's documented configuration. They were not launched in this repository's test environment.

## Cursor as a host

Do not add this server to the MCP configuration of a project Cursor is editing. `.cursor-plugin/` exists so the plugin can be submitted. The server refuses `delegate` when the client identifies itself as Cursor. The rule in `rules/no-self-delegation.mdc` says the same thing.
