# Release process

## Unreleased 0.6.1

- Add a first-class Expo/React Native root-scaffold plan with explicit Node and network prerequisites.
- Defer bootstrap artifact writes until a root runtime scaffold completes and the workspace is re-inspected.
- Preserve Expo-owned TypeScript configuration and prevent silent nested-app generation in populated workspaces.
- Clarify MCP-unavailable, lint auto-install, and audit-status safeguards in the runtime workflow.
- Replace the fixed AGENTS.md template with Korean/English evidence-based rendering that reflects the reviewed project context, scoped rules, coding policy, document shape, and verification policy.
- Track verification evidence per runtime and project area, retain package-manager scope, expose command effects as not-run declarations, and report unconfirmed tests rather than implying coverage.
- Keep large AGENTS.md files within a 16 KiB root-guide budget by planning a complete evidence index; preserve AGENTS override and existing build-system conflicts as merge previews.
- Add fixture coverage for 25 runtime/domain shapes, mixed repositories, command safety and 336 guide-policy/locale combinations.

1. Update the version in `plugins/project-bootstrap/plugin.json` and add release notes.
2. Run `node scripts/build.mjs` to refresh the packaged MCP runtime.
3. Run `node scripts/validate-catalog.mjs` and `node --test server/test/*.test.js`.
4. Confirm the marketplace entry resolves the plugin from a clean checkout.
5. Tag the matching semantic version and publish the GitHub release.

The plugin does not self-update. Codex should surface an available marketplace version and let the user decide whether to upgrade.
