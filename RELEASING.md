# Releasing

Do not publish until Francesco authorizes it. This repository is ready for that step. Nothing here publishes by itself.

## Version

1. Update `package.json` and the plugin manifests that repeat the version: `plugin.json`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `server.json`.
2. Add a `CHANGELOG.md` section for the version.
3. Run `npm test`, `npm run typecheck`, and `node scripts/package-smoke.mjs`.
4. Commit and push `main`.
5. Tag `vX.Y.Z` on that commit and push the tag.

## GitHub release

Run the `release` workflow manually. Set `tag` to the tag and `create_github_release` to true. The workflow runs the test matrix, then creates a GitHub release from the changelog. It does not publish to npm.

## npm

After authorization, from a clean checkout of the tag:

```shell
npm pack
npm publish --access public
```

Trusted publishing can be added later in npmjs.com for this repository. Do not store an npm token in the repository.

## Marketplaces

After the commit is public:

- Codex and Claude: add the git URL as a marketplace, then install `iaf-agent-bridge`.
- Cursor: submit the repository at https://cursor.com/marketplace/publish . That review is manual.
- Copilot: install from the repository URL once the host's plugin command accepts it.

## Rollback

If a release is wrong, publish a newer patch. Do not rewrite the tag. Document the correction in the changelog.
