---
name: project-maintenance
description: Assess an existing local project, identify evidenced code or configuration gaps, and apply only user-approved targeted improvements. Do not use to bootstrap a new project.
---

# Project Maintenance

Use the bundled `project-maintenance` MCP server for a local, read-only workspace inventory and implementation-assessment index. This Skill operates on existing projects only. It must not scaffold a new runtime, replace a detected stack, or generate a generic bootstrap bundle.

## Assess first

1. Call `inspect_workspace` before making a conclusion. Preserve all detected languages, manifests, deployment configuration, Codex settings, and user-owned files. If the inventory is truncated or the access boundary is not configured, disclose that limitation.
2. Clarify the assessment target only when needed: an explicit defect, acceptance criteria, configuration concern, or a broad exploratory review. For implementation criteria, read [implementation-review.md](references/implementation-review.md) and call `assess_implementation` with reviewed, workspace-relative evidence. Without explicit criteria, label conclusions exploratory rather than an acceptance verdict.
3. Inspect only evidence relevant to the finding. Distinguish observed defects, declared-but-not-run checks, caller-reported results, and unverified assumptions. Report each finding with severity, evidence path, impact, and a minimal recommended repair.
4. Do not edit files, run commands, install dependencies, send source externally, change hosted settings, or claim a behavior works merely because a corresponding file exists during assessment.

## Improve only after approval

1. Turn the selected finding into a focused repair plan. Include the reason, exact affected paths, intended code or configuration changes, compatibility or migration risks, and any proposed command with its working directory and effects.
2. Request explicit approval of the exact file plan before any edit. A request to assess, diagnose, or recommend does not approve modifications. Never overwrite, delete, rename, or migrate an existing non-identical file without a path-specific user decision.
3. After approval, edit only the approved paths. Keep changes minimal, preserve the project's detected conventions, and add or update tests when they are necessary to establish the approved behavior. Do not begin unrelated cleanup or feature work.
4. Commands are a separate approval boundary. Before running one, list its exact command, working directory, purpose, network effect, and expected side effects. Report actual command results separately from declared or caller-reported checks.

## Boundaries

- This plugin is for assessment and maintenance of an existing project, not new-project setup. Direct users who need architecture selection, runtime scaffolding, or generated workspace guides to `project-bootstrap`.
- Treat security, data migration, dependency upgrades, production-facing changes, and hosted-service changes as high-impact: explain the impact and wait for explicit approval of each affected action.
- Keep the final report concise: findings reviewed, evidence, approved changes made or intentionally deferred, and verification status.

Checking or upgrading the marketplace may use the network. Ask before it. Do not send workspace source to external services.
