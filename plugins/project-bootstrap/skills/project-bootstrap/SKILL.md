---
name: project-bootstrap
description: Inspect a local project, recommend and validate its architecture and platform setup, then prepare an approval-gated bootstrap plan. Use for new or existing projects; do not use for unreviewed file changes.
---

# Project Bootstrap

Use the bundled `project-bootstrap` MCP server to keep selection, validation, and planning deterministic. Its tools are read-only. Treat its output as a proposal, not as authorization to write files or run commands.

## Discovery and selection

1. Ask for the project goal, team constraints, expected scale, budget sensitivity, regulatory requirements, operations preference, preferred display locale, and whether the workspace is new or existing when those facts are unknown.
2. Call `inspect_workspace` for the target workspace. For an existing project, preserve detected runtimes, manifests, deployment configuration, and user-owned files unless the user explicitly asks to replace them.
3. Call `list_catalog` and `recommend` to present a starting profile plus ranked, explainable alternatives. A profile may be overridden one decision at a time; never silently select a technology.
4. Call `validate_selection`. Explain every warning or block with the referenced catalogue IDs and alternatives. Do not create an implementation plan while blocked rules remain unresolved.
5. Call `create_plan` only after the user confirms the selection. Present the validation summary, proposed paths, conflict list, generated records, and command list.

## Approval gate

Do not create, edit, delete, rename, stage, commit, push, or open a pull request until the user explicitly approves the presented file plan.

After file-plan approval, write only the planned non-conflicting local artifacts. Record the selected catalogue version and decisions in:

- `.project-bootstrap/selection.yaml`
- `docs/project-bootstrap/decision-record.md`
- `docs/project-bootstrap/validation-report.md`
- `docs/architecture/overview.md`
- `docs/project-bootstrap/execution-plan.md`

Create `.codex/config.toml`, `AGENTS.md`, container files, and CI files only when they are in the approved plan. If a planned path already exists and differs from the generated content, stop and ask for a path-specific overwrite decision. Never delete files or perform automatic migrations.

## Commands and upgrades

Commands are a second approval boundary. List each exact command, its working directory, purpose, network effect, and expected files before running it. If the user explicitly approves the full listed batch, run that batch; otherwise request approval per command. Never run dependency installation, generators, infrastructure initialization, Git commands, or marketplace upgrades merely because a plan has been approved.

Checking or upgrading the marketplace may use the network. Ask before it. Do not send workspace source or bootstrap records to external services.
