# Release

[npm `iaf-agent-bridge@1.0.1`](https://www.npmjs.com/package/iaf-agent-bridge) is the current public package. GitHub Release [v1.0.1](https://github.com/francescoveryra-dot/IAF-Agent-Bridge/releases/tag/v1.0.1) peels to `13e3cb0e55467040259a54ac5e423eaaaf9b0fdf`.

[v1.0.0](https://github.com/francescoveryra-dot/IAF-Agent-Bridge/releases/tag/v1.0.0) remains public and peels to `97128e776c796968cea38d2885caf3a22ffb35ce`. Its npm tarball does not contain `mcpName`.

The Official MCP Registry entry [`io.github.francescoveryra-dot/iaf-agent-bridge`](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.francescoveryra-dot%2Fiaf-agent-bridge/versions/latest) version `1.0.1` is public and `active`. It points at npm package `iaf-agent-bridge` version `1.0.1` with stdio transport.

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
