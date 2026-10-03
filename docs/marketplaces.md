# Marketplaces

Statuses below were checked on 2026-10-03 against the public npm registry, the Official MCP Registry, and the public repository.

| Channel | Status | Install | Notes |
| --- | --- | --- | --- |
| GitHub source | PUBLISHED | `git clone --branch v1.0.0 https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git` | Tag `v1.0.0` is the release commit. A fresh clone builds and `node dist/cli.js --version` prints `1.0.0`. |
| GitHub Release | PUBLISHED | [v1.0.1](https://github.com/francescoveryra-dot/IAF-Agent-Bridge/releases/tag/v1.0.1) is current. [v1.0.0](https://github.com/francescoveryra-dot/IAF-Agent-Bridge/releases/tag/v1.0.0) remains available. | `v1.0.1` peels to `13e3cb0`. `v1.0.0` peels to `97128e7`. |
| npm | PUBLISHED | `npx -y iaf-agent-bridge@1.0.1` | Latest is `iaf-agent-bridge@1.0.1`: https://www.npmjs.com/package/iaf-agent-bridge. `1.0.0` remains published and has no `mcpName`. |
| MCP registry | PUBLISHED | [`io.github.francescoveryra-dot/iaf-agent-bridge` 1.0.1](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.francescoveryra-dot%2Fiaf-agent-bridge/versions/1.0.1) | Status `active`. Package `iaf-agent-bridge@1.0.1`, transport `stdio`. |
| Codex | PUBLIC-INSTALL-VERIFIED | `codex plugin marketplace add https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git --ref main` then `codex plugin add iaf-agent-bridge@iaf-agent-bridge` | Verified with Codex CLI 0.160.0 against commit `97128e7`. Tools `delegate`, `cancel`, and `doctor` were visible. This is a GitHub marketplace import, not a listing in the OpenAI plugin directory. |
| OpenAI plugin directory | NOT APPLICABLE | Not listed | The public directory requires a hosted HTTPS MCP server. This product is a local stdio bridge to the Cursor CLI. Install it from this Git repository with Codex. |
| Claude Code | PUBLIC-INSTALL-VERIFIED | `claude plugin marketplace add https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git` | `claude plugin validate --strict` passed. A fresh clone was added as a local marketplace. Claude Code uses repository marketplaces. There is no separate directory listing for this plugin. |
| Cursor CLI | PUBLIC-INSTALL-VERIFIED | `agent plugin marketplace add https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git` | The public repository indexed 1 plugin. |
| Cursor Marketplace | NOT LISTED | Sign in at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) and submit this repository. | Direct CLI install is verified. Public listing was not found. |
| GitHub Copilot CLI | PUBLIC-INSTALL-VERIFIED | `copilot plugin marketplace add francescoveryra-dot/IAF-Agent-Bridge` then `copilot plugin install iaf-agent-bridge@iaf-agent-bridge` | Copilot CLI 1.0.91 installed plugin `iaf-agent-bridge@iaf-agent-bridge` v1.0.0 from the public repository. This is repository marketplace install, not a listing in the default `copilot-plugins` catalog. |
| VS Code, Visual Studio, JetBrains, Windsurf, OpenCode, Antigravity, Kiro, Kilo, Zed | NOT-APPLICABLE | [hosts.md](hosts.md) | Generic MCP configuration. No plugin package was submitted. |
