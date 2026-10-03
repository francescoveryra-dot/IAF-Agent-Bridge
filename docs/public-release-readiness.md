# Public release readiness

Evidence is from this repository on 2026-10-02. "Ready" means the artifact exists and the listed check was run. It does not mean a marketplace listing or an npm publication.

| Area | Status | Evidence | External action |
| --- | --- | --- | --- |
| GitHub public repository | Ready | `gh repo view` reported `visibility: PUBLIC` | none |
| Anonymous clone | Checked in the final report | HTTPS clone | none |
| README | Ready | `README.md` links to `docs/` and uses the public HTTPS URL | none |
| License | Ready | `LICENSE` is MIT. `package.json` and plugin manifests say MIT | none |
| Community profile | Ready | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, issue forms, pull request template | none |
| Private vulnerability reporting | Ready | API returned `enabled: true` | none |
| Dependabot | Ready | `.github/dependabot.yml` covers npm and GitHub Actions. Security updates were already enabled | none |
| CodeQL | Ready | Default setup API returned `state: configured` | none |
| Secret scanning | Ready | API status `enabled` | none |
| Push protection | Ready | API status `enabled` | none |
| CI Linux, macOS, Windows | Ready on commit `97128e7` | Release-preparation run `37063219507` succeeded for all three | none |
| Cursor plugin | Ready | `.cursor-plugin/plugin.json` | CLI indexed the public repository |
| Cursor public marketplace | SUBMITTED — PENDING REVIEW | Publisher application received by Cursor | Not publicly listed. Direct CLI install remains available |
| Claude plugin | Ready | `claude plugin validate --strict` succeeded on the release tree | none |
| Claude marketplace | Public repository install verified | Fresh clone added with `claude plugin marketplace add` | No central directory |
| Codex plugin | Public GitHub install verified | Codex CLI 0.160.0 installed `iaf-agent-bridge@iaf-agent-bridge` from this repository at `97128e7` | Not listed in the OpenAI plugin directory |
| Copilot | Public GitHub install verified | Copilot CLI 1.0.91 installed `iaf-agent-bridge@iaf-agent-bridge` v1.0.0 | Repository marketplace, not the default `copilot-plugins` catalog |
| npm package | PUBLISHED | `iaf-agent-bridge@1.0.2` is latest. `1.0.1` and `1.0.0` remain published | https://www.npmjs.com/package/iaf-agent-bridge |
| MCP registry | PUBLISHED | `io.github.francescoveryra-dot/iaf-agent-bridge` version `1.0.2`, status active | https://registry.modelcontextprotocol.io/v0.1/servers/io.github.francescoveryra-dot%2Fiaf-agent-bridge/versions/1.0.2 |
| Generic MCP | Documented | `docs/hosts.md` | Configuration only |
| Fresh installation | Recorded in the final report | HTTPS clone, install, test, doctor | none |
| Cursor ACP and resume | Ready | `scripts/acceptance.mjs` | none |
| Natural supervisor loop | Ready | Skill plus the two-turn acceptance result | none |
| Master Prompt | Ready | Acceptance used one session for both deliverables and did not invent `PROJECT_SPEC.md` | none |
| Security tests | Ready | Workspace, symlink, destructive commands, malformed frames, recursion | none |
| Secret and history scan | Ready | No credentials in history or the tree | none |
| SBOM | Published with the release | `sbom.cdx.json` on the v1.0.0 GitHub Release | none |
| Branch protection | Active ruleset `protect-main` | Blocks force-push and deletion of `main`. Bypass is not granted. | Required status checks were not added, so a normal push to `main` still works. |
