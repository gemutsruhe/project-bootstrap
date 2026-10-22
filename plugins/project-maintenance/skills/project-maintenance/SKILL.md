---
name: project-maintenance
description: Assess an existing local project, identify evidenced code or configuration gaps, and apply only user-approved targeted improvements. Do not use to bootstrap a new project.
---

# Project Maintenance

Use the bundled `project-maintenance` MCP server for a local, read-only workspace inventory and implementation-assessment index. This Skill operates on existing projects only. It must not scaffold a new runtime, replace a detected stack, or generate a generic bootstrap bundle.

## Assess first

1. Call `inspect_workspace` before making a conclusion. Preserve all detected languages, manifests, deployment configuration, Codex settings, and user-owned files. If the inventory is truncated or the access boundary is not configured, disclose that limitation.
2. Clarify the assessment target only when needed: an explicit defect, acceptance criteria, configuration concern, or a broad exploratory review. For implementation criteria, read [implementation-review.md](references/implementation-review.md) and call `assess_implementation` with reviewed, workspace-relative evidence. Without explicit criteria, label conclusions exploratory rather than an acceptance verdict.
3. When the user says **"전수감사 시작"**, "start a full audit", or otherwise asks for a simple full, sentence-by-sentence, policy, or evidence audit without naming documents, call `assess_implementation.policyAudit` with `scope: "auto"`. The server selects only conventionally named workspace policy and instruction documents and returns the selected paths. If the user names documents, use `entryDocuments` instead. The agent must automatically retrieve every page with the same scope and its `nextPageToken`. Retrieve every page before reaching a conclusion. Review the returned `policy` and `exception` items individually; retain their heading context and exception links. Treat `context` items as interpretation evidence, not binary requirements. A blocked audit, stale page token, or incomplete page sequence prevents a coverage conclusion.
4. For a follow-up audit after another chat, a repair attempt, or a prior audit report, begin with a reconciliation baseline. Record the prior report or thread as caller-provided evidence, re-inventory the current workspace, and turn each inherited finding into a current recheck. Preserve earlier check outcomes with their original provenance: a command shown in another chat is caller-reported, not current agent execution. Every inherited failed check stays visible until an authorized re-run or current evidence establishes its status.
5. Produce a reconciliation matrix before a follow-up conclusion: prior finding ID or description, current evidence path and line, current check provenance/status, and one of `reproduced`, `partially-reproduced`, `not-currently-observed`, or `unverified`. `not-currently-observed` is not a resolution claim when behavior, a runtime dependency, or an external environment was not checked. Do not restate a prior finding as current without fresh evidence, and do not call the follow-up a complete audit while any inherited policy item or failed check lacks a row.
6. Inspect only evidence relevant to the finding. Distinguish observed defects, declared-but-not-run checks, caller-reported results, agent-executed results, and unverified assumptions. Report each finding with severity, evidence path and line, impact, automatic-enforcement gap, and a minimal recommended repair.
7. Do not edit files, run commands, install dependencies, send source externally, change hosted settings, or claim a behavior works merely because a corresponding file exists during assessment.

## Improve only after approval

1. Turn the selected finding into a focused repair plan. Include the reason, exact affected paths, intended code or configuration changes, compatibility or migration risks, and any proposed command with its working directory and effects.
2. Request explicit approval of the exact file plan before any edit. A request to assess, diagnose, or recommend does not approve modifications. Never overwrite, delete, rename, or migrate an existing non-identical file without a path-specific user decision.
3. After approval, edit only the approved paths. Keep changes minimal, preserve the project's detected conventions, and add or update tests when they are necessary to establish the approved behavior. Do not begin unrelated cleanup or feature work.
4. Commands are a separate approval boundary. Before running one, list its exact command, working directory, purpose, network effect, and expected side effects. After explicit approval and execution, provide the result to `assess_implementation.executedChecks` with its execution-log reference. Report actual command results separately from declared or caller-reported checks.

## Boundaries

- This plugin is for assessment and maintenance of an existing project, not new-project setup. Direct users who need architecture selection, runtime scaffolding, or generated workspace guides to `project-bootstrap`.
- Treat security, data migration, dependency upgrades, production-facing changes, and hosted-service changes as high-impact: explain the impact and wait for explicit approval of each affected action.
- Keep the final report concise: findings reviewed, evidence, approved changes made or intentionally deferred, and verification status. For a full evidence audit, prioritize the complete paged item matrix over a score; each policy or exception item needs a verdict of compliant, partially-compliant, non-compliant, unverified, or not-applicable.

Checking or upgrading the marketplace may use the network. Ask before it. Do not send workspace source to external services.
