---
name: project-bootstrap
description: Inspect a local project, recommend and validate its architecture and platform setup, then prepare an approval-gated bootstrap plan. Use for new or existing projects; do not use for unreviewed file changes.
---

# Project Bootstrap

Use the bundled `project-bootstrap` MCP server to keep selection, validation, and planning deterministic. Its tools are read-only. Treat its output as a proposal, not as authorization to write files or run commands.

## Guided interview and selection

1. Call `inspect_workspace` for the target workspace before asking for details that the inventory can determine. For an existing project, preserve detected runtimes, manifests, deployment configuration, and user-owned files unless the user explicitly asks to replace them.
2. Collect unknown decisions as a short, progressive interview. Never present the full questionnaire at once.
   - When the host exposes a structured question control in Plan mode, use it for one decision at a time. Provide two or three mutually exclusive choices, put the recommended choice first, and state each choice's consequence concisely.
   - Treat the host's `Other`/comment response as a first-class answer. Explicitly invite a comment whenever the listed choices do not fit; do not force a listed choice.
   - When a structured control is unavailable, present the same one-decision question as a numbered Markdown list ending in `Other — describe your situation`. Wait for the answer before the next decision.
   - A choice, comment, or profile confirmation only guides planning. It is never approval to write files or run commands.
3. Ask only the next decision needed, skipping facts already supplied or found in the inventory. Use this order unless the user's answer makes another question more relevant:
   1. Product or service goal and starting profile.
   2. Team size and existing or preferred language/framework constraints.
   3. Expected traffic and operations preference.
   4. Budget sensitivity and regulatory or security requirements.
   5. Display locale.
4. Call `list_catalog` and `recommend` after enough context is available. Present the ranked, explainable starting profiles in another structured choice (or the text fallback) and let the user select or comment with an override. A profile may be overridden one decision at a time; never silently select a technology.
5. Call `validate_selection`. Explain every warning or block with the referenced catalogue IDs and alternatives. If a choice is blocked, ask a replacement question; do not create an implementation plan while blocked rules remain unresolved.
6. Call `create_plan` only after the user explicitly confirms the selection. Present the validation summary, proposed paths, conflict list, generated records, and command list.

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
