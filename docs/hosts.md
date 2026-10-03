# Hosts

One stdio server. The host configuration changes. Replace `CLONE` with the absolute path of your clone.

## ChatGPT Desktop

ChatGPT and Codex share one plugin directory. The current OpenAI guide says plugins can be used in Chat and in Work on the desktop app, and in Codex there: [Plugins](https://developers.openai.com/codex/plugins). A public directory listing requires a reviewed submission. This repository is not in that public directory. Searching chatgpt.com for the name will not show it until OpenAI lists it.

Local use does not need an OpenAI API key. Install the Git marketplace in the ChatGPT desktop Plugins directory, then start a new conversation and mention `@iaf-agent-bridge`.

The portable package is root `plugin.json` plus root `mcp.json`. `plugin.json` follows the Agent Plugins schema, so it does not also point at a second MCP file. `mcp.json` starts `npx -y iaf-agent-bridge` in the plugin directory. That is the local stdio server. The Codex checkout launcher remains in `.codex-plugin/plugin.json`. GitHub Copilot still has `.mcp.copilot.json`. It is not an HTTP endpoint, and this project does not publish a tunnel or a public MCP URL. Normal ChatGPT Chat uses a separate Personal Private path: the user's own Secure MCP Tunnel to a local socket. That path is documented in [remote-chat.md](remote-chat.md). IAF does not run a relay for it.

On the 2026-10-03 desktop build, ChatGPT Work could call `doctor` through the existing Codex-format plugin. A normal Chat conversation in the same app did not receive `delegate`, `cancel`, or `doctor`. That is a product-surface limit observed on that account, not something this repository can force. If a new Chat still has no IAF tools after installing the portable package, use Work or Codex in the desktop app. Those surfaces already launch this local server.

Do not infer a quota change from the surface name. This bridge does not call the OpenAI API. Whichever ChatGPT or Codex mode is open is the mode that runs the supervisor model.

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
claude plugin marketplace add francescoveryra-dot/IAF-Agent-Bridge
claude plugin install iaf-agent-bridge@iaf-agent-bridge
```

Inside a session the same steps are `/plugin marketplace add francescoveryra-dot/IAF-Agent-Bridge` and `/plugin install iaf-agent-bridge@iaf-agent-bridge`.

A source checkout can also be added with `claude mcp add iaf-agent-bridge -- node CLONE/dist/cli.js`. The published package is `npx -y iaf-agent-bridge@1.1.0`. See [marketplaces.md](marketplaces.md).

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
      "args": ["-y", "iaf-agent-bridge@1.1.0"]
    }
  }
}
```

That is `.vscode/mcp.json` for a workspace, or the user MCP configuration. No VS Code extension is required. Visual Studio uses the same `servers` shape. Zed uses `context_servers`. OpenCode and Kilo use `mcp` with `"type": "local"` and `command` as one array. Windsurf uses `~/.codeium/windsurf/mcp_config.json`. Antigravity uses `~/.gemini/config/mcp_config.json`. Kiro uses `.kiro/settings/mcp.json`. JetBrains AI Assistant takes the same command and arguments in its MCP settings.

Those shapes match each product's documented configuration. They were not launched in this repository's test environment.

## Cursor as a host

Do not add this server to the MCP configuration of a project Cursor is editing. `.cursor-plugin/` exists so the plugin can be submitted. The server refuses `delegate` when the client identifies itself as Cursor. The rule in `rules/no-self-delegation.mdc` says the same thing.
