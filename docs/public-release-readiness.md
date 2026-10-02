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
| CI Linux, macOS, Windows | Ready on commit `1019ade` | Run `37055341407` succeeded for all three | Re-check the run for the next commit |
| npm package | Ready, not published | `npm pack` and a temporary install | `npm publish --access public` |
| Cursor plugin | Ready | `.cursor-plugin/plugin.json` | none for the files |
| Cursor public marketplace | Not submitted | `agent plugin marketplace add` indexed 1 plugin | https://cursor.com/marketplace/publish |
| Claude plugin | Ready | `claude plugin validate --strict` succeeded | none |
| Claude marketplace | Locally added | `claude plugin marketplace add ./ --scope local` | A new user adds the git URL. No central submission |
| Codex plugin | Manifest ready | `.codex-plugin/plugin.json` | Codex CLI was not installed here |
| Copilot | Manifest ready | `plugin.json`, `.mcp.copilot.json` | Copilot CLI was not installed |
| Generic MCP | Documented | `docs/hosts.md` | Those hosts were not launched here |
| MCP registry | Descriptor only | `server.json` | Submit after npm publish |
| Fresh installation | Recorded in the final report | HTTPS clone, install, test, doctor | none |
| Cursor ACP and resume | Ready | `scripts/acceptance.mjs` | none |
| Natural supervisor loop | Ready | Skill plus the two-turn acceptance result | none |
| Master Prompt | Ready | Acceptance used one session for both deliverables and did not invent `PROJECT_SPEC.md` | none |
| Security tests | Ready | Workspace, symlink, destructive commands, malformed frames, recursion | none |
| Secret and history scan | Ready | No credentials in history or the tree | none |
| SBOM | Generated on demand | `npm sbom --sbom-format cyclonedx` in CI and the release workflow | none until a release is cut |
| Branch protection | Not changed | No ruleset was applied | Optional: require the `test` check on `main` and block force-push |
