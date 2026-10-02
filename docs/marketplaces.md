# Marketplaces

Statuses below were checked on 2026-10-02 against the public repository and the services named here.

| Channel | Status | Install | Notes |
| --- | --- | --- | --- |
| GitHub source | PUBLISHED | `git clone --branch v1.0.0 https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git` | Tag `v1.0.0` is the release commit. A fresh clone builds and `node dist/cli.js --version` prints `1.0.0`. |
| GitHub Release | PUBLISHED | [v1.0.0](https://github.com/francescoveryra-dot/IAF-Agent-Bridge/releases/tag/v1.0.0) | Public release. Assets: `iaf-agent-bridge-1.0.0.tgz`, `sbom.cdx.json`, `SHA256SUMS`. |
| npm | READY-BUT-AUTH-BLOCKED | Not on the registry | `GET https://registry.npmjs.org/iaf-agent-bridge` returned 404. The machine's npm credential was rejected, so `npm publish --access public` did not create the package. |
| MCP registry | READY-BUT-AUTH-BLOCKED | Not registered | The official registry requires the public npm package first. `server.json` stays a local descriptor until that package exists. |
| Codex | PUBLIC-INSTALL-VERIFIED | `codex plugin marketplace add https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git --ref main` then `codex plugin add iaf-agent-bridge@iaf-agent-bridge` | Verified with Codex CLI 0.160.0 against commit `97128e7`. Tools `delegate`, `cancel`, and `doctor` were visible. This is a GitHub marketplace import, not a listing in the OpenAI plugin directory. |
| OpenAI plugin directory | READY-BUT-HUMAN-SUBMISSION-REQUIRED | Not listed | Public directory submission is the [plugin submission portal](https://developers.openai.com/plugins/deploy/submission). It requires a signed-in verified developer and personal review attestations. |
| Claude Code | PUBLIC-INSTALL-VERIFIED | `claude plugin marketplace add https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git` | `claude plugin validate --strict` passed. A fresh clone was added as a local marketplace. Claude Code uses repository marketplaces. There is no separate directory listing for this plugin. |
| Cursor CLI | PUBLIC-INSTALL-VERIFIED | `agent plugin marketplace add https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git` | The public repository indexed 1 plugin. |
| Cursor Marketplace | READY-BUT-HUMAN-SUBMISSION-REQUIRED | Not listed | [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) requires a signed-in publisher. A search of the public marketplace did not show this plugin. |
| GitHub Copilot CLI | PUBLIC-INSTALL-VERIFIED | `copilot plugin marketplace add francescoveryra-dot/IAF-Agent-Bridge` then `copilot plugin install iaf-agent-bridge@iaf-agent-bridge` | Copilot CLI 1.0.91 installed plugin `iaf-agent-bridge@iaf-agent-bridge` v1.0.0 from the public repository. This is repository marketplace install, not a listing in the default `copilot-plugins` catalog. |
| VS Code, Visual Studio, JetBrains, Windsurf, OpenCode, Antigravity, Kiro, Kilo, Zed | NOT-APPLICABLE | [hosts.md](hosts.md) | Generic MCP configuration. No plugin package was submitted. |
