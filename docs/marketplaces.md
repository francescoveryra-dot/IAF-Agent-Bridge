# Marketplaces

Nothing in this list is a public marketplace listing except the GitHub repository itself.

| Channel | Status | Install | Publication |
| --- | --- | --- | --- |
| GitHub source | Published and public | `git clone https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git` | Already the public repo |
| Claude Code plugin | Locally validated | `claude plugin marketplace add ./ --scope local` from a clone, or add the GitHub URL | No separate Claude directory submission is required for a git marketplace |
| Cursor plugin | Locally discovered | `agent plugin marketplace add https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git` | Manual: https://cursor.com/marketplace/publish |
| Codex plugin | Manifest ready. CLI not installed here | Add `.codex-plugin` via Codex's plugin marketplace command, or use [hosts.md](hosts.md) | No curated submission was made |
| GitHub Copilot | Manifest ready. CLI not installed here | `plugin.json` and `.mcp.copilot.json` | Install from the repository when the Copilot CLI accepts a git plugin |
| npm | Packed locally. Not published | After publish: `npx -y iaf-agent-bridge` | `npm publish --access public` from a release tag, after authorization |
| MCP registry | `server.json` is the descriptor. Not submitted | n/a until the npm package exists | Submit through the [MCP registry](https://github.com/modelcontextprotocol/registry) after npm publication |
| VS Code, Visual Studio, JetBrains, Windsurf, OpenCode, Antigravity, Kiro, Kilo, Zed | MCP configuration only | [hosts.md](hosts.md) | No marketplace package |

Validation that was actually run on the development machine:

- `claude plugin validate --strict` on the marketplace and plugin manifests: success.
- `claude plugin marketplace add ./ --scope local`: marketplace `iaf-agent-bridge` added in local settings.
- `agent plugin marketplace add https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git`: Cursor indexed 1 plugin.

Those local registrations belong to the machine that developed the project. A new user adds the marketplace themselves.
