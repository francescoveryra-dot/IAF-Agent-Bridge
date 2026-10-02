# Release

1.0.0 is the version in the tree. It has not been published to npm and it has not been cut as a GitHub Release. The changelog marks it unreleased until that happens.

## Cut a release

1. Confirm `package.json`, `plugin.json`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, and `server.json` share one version. `npm test` checks the copies it knows.
2. Move the changelog section from Unreleased to the version.
3. Run `npm test`, `npm run typecheck`, and `node scripts/package-smoke.mjs`.
4. Tag `vX.Y.Z` on that commit and push the tag.
5. Run the `release` workflow by hand. Set `tag` and set `create_github_release` to true. The workflow runs CI, writes a CycloneDX SBOM, and creates the GitHub Release. It does not publish to npm.

## npm

After you decide to publish, from the tag:

```shell
npm publish --access public
```

Prefer npm trusted publishing for this repository over a long-lived token. Do not commit a token.

Generate a bill of materials locally with:

```shell
npm sbom --omit=dev --sbom-format cyclonedx
```

## Marketplaces

Public listing steps are in [marketplaces.md](marketplaces.md). None of them run from a push to `main`.
