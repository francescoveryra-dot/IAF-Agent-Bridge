# Release

GitHub Release [v1.0.0](https://github.com/francescoveryra-dot/IAF-Agent-Bridge/releases/tag/v1.0.0) is public. The tag peels to commit `97128e776c796968cea38d2885caf3a22ffb35ce`. The release is not a draft and not a prerelease. Its assets are `iaf-agent-bridge-1.0.0.tgz`, `sbom.cdx.json`, and `SHA256SUMS`.

npm package `iaf-agent-bridge` is not on the public registry. Publication stopped because the npm credential on this machine was rejected. Do not publish another version to work around that. When an authorized npm account is available, publish `1.0.0` from that same tag:

```shell
git checkout v1.0.0
npm publish --access public
```

Prefer npm trusted publishing over a long-lived token. Do not commit a token. After npm publication, register `server.json` with the official MCP Registry. That registry requires the published npm package and an `mcpName` field that matches `io.github.francescoveryra-dot/iaf-agent-bridge`.

## Cut a later release

1. Confirm `package.json`, `plugin.json`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, and `server.json` share one version. `npm test` checks the copies it knows.
2. Add a changelog section for the version.
3. Run `npm test`, `npm run typecheck`, and `node scripts/package-smoke.mjs`.
4. Tag `vX.Y.Z` on that commit and push the tag. Do not move a tag that already has a public release.
5. Run the `release` workflow by hand. Set `tag` and set `create_github_release` to true. The workflow runs CI, writes a CycloneDX SBOM, and creates the GitHub Release. It does not publish to npm.

Generate a bill of materials locally with:

```shell
npm sbom --omit=dev --sbom-format cyclonedx
```

## Marketplaces

Current channel statuses are in [marketplaces.md](marketplaces.md). None of them run from a push to `main`.
