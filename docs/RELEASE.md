# Release process

## Unreleased project-maintenance 0.3.0

- Add the one-command full-audit route: `policyAudit.scope: "auto"` discovers conventionally named policy and instruction documents, reports its selection, and preserves paged, complete evidence coverage.
- Teach the Project Maintenance Skill to handle `전수감사 시작` / "start a full audit" by discovering documents and retrieving every page without self-authorizing commands.

## Unreleased project-maintenance 0.2.0

- Add a paged, read-only full-evidence policy audit to `assess_implementation`.
- Preserve the distinction between declared, caller-reported, and authorized agent-executed checks.
- Keep configuration audit evidence limited to safe paths, keys, scope, and state classifications.

## Unreleased 0.6.1

- Add a first-class Expo/React Native root-scaffold plan with explicit Node and network prerequisites.
- Defer bootstrap artifact writes until a root runtime scaffold completes and the workspace is re-inspected.
- Preserve Expo-owned TypeScript configuration and prevent silent nested-app generation in populated workspaces.
- Clarify MCP-unavailable, lint auto-install, and audit-status safeguards in the runtime workflow.
- Replace the fixed AGENTS.md template with Korean/English evidence-based rendering that reflects the reviewed project context, scoped rules, coding policy, document shape, and verification policy.
- Track verification evidence per runtime and project area, retain package-manager scope, expose command effects as not-run declarations, and report unconfirmed tests rather than implying coverage.
- Keep large AGENTS.md files within a 16 KiB root-guide budget by planning a complete evidence index; preserve AGENTS override and existing build-system conflicts as merge previews.
- Add fixture coverage for 25 runtime/domain shapes, mixed repositories, command safety and 336 guide-policy/locale combinations.

1. Update the version in every changed plugin manifest and MCP server declaration, then add release notes.
2. Run `node scripts/build.mjs` to refresh the packaged MCP runtime.
3. Run `node scripts/validate-catalog.mjs` and `node --test server/test/*.test.js`.
4. Confirm the marketplace entry resolves the plugin from a clean checkout.
5. Tag the matching semantic version and publish the GitHub release.

The plugin does not self-update. Codex should surface an available marketplace version and let the user decide whether to upgrade.
