# Release process

1. Update the version in `plugins/project-bootstrap/plugin.json` and add release notes.
2. Run `node scripts/build.mjs` to refresh the packaged MCP runtime.
3. Run `node scripts/validate-catalog.mjs` and `node --test server/test/*.test.js`.
4. Confirm the marketplace entry resolves the plugin from a clean checkout.
5. Tag the matching semantic version and publish the GitHub release.

The plugin does not self-update. Codex should surface an available marketplace version and let the user decide whether to upgrade.
