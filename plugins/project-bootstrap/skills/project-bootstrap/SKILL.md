---
name: project-bootstrap
description: Inspect a local project, recommend and validate its architecture and platform setup, then generate approved bootstrap artifacts. Use for new or existing projects; require explicit approval before file changes.
---

# Project Bootstrap

Use the bundled `project-bootstrap` MCP server to keep selection, validation, and planning deterministic. Its tools are read-only. Treat its output as a proposal until the user approves the exact file plan; after that approval, this Skill creates the approved local bootstrap artifacts itself.

## Guided interview and selection

1. Call `inspect_workspace` for the target workspace before asking for details that the inventory can determine. For an existing project, preserve detected programming languages, runtimes, manifests, deployment configuration, Codex settings, and user-owned files unless the user explicitly asks to replace them. The inventory returns only a redacted summary of Project Bootstrap response-locale preferences in applicable user and project Codex configs; never request, echo, copy, or rewrite raw Codex configuration.
2. Collect unknown decisions as a short, progressive interview. Never present the full questionnaire at once.
   - When the host exposes a structured question control in Plan mode, use it for one decision at a time. Provide two or three mutually exclusive choices, put the recommended choice first, and state each choice's consequence concisely.
   - Treat the host's `Other`/comment response as a first-class answer. Explicitly invite a comment whenever the listed choices do not fit; do not force a listed choice.
   - When a structured control is unavailable, present the same one-decision question as a numbered Markdown list ending in `Other — describe your situation`. Wait for the answer before the next decision.
   - A choice, comment, or profile confirmation only guides planning. It is never approval to write files or run commands.
3. Before asking the user to choose between catalogue-backed candidates, make those candidate records inspectable.
   - Call `list_catalog` with the relevant kind and locale. Then call `render_catalog_explorer` with only the currently shown candidate IDs, locale, and a concise comparison title. It renders candidate cards and the packaged source Markdown in the MCP Apps UI.
   - Keep an explorer comparison focused: pass no more than 12 candidates, and pass only the rankings or candidates relevant to the current decision. The explorer is read-only and never creates or edits catalogue files.
   - Let the user use the explorer's selection and optional comment control. A submitted explorer selection is a structured user answer for the current catalogue decision, not merely a transcript message. Treat its `selectedCatalogId` as selected, retain choices from other decisions, and do not ask the same choice again. Then call `validate_selection` when the accumulated choices are valid input, or render/ask the next relevant candidates. It is never approval to write files or run commands.
   - If the host does not render MCP Apps UI, retain each candidate's `path`, summary, and ID in the written response, then use the normal structured-question or Markdown-choice fallback.
4. Ask only the next decision needed, skipping facts already supplied or found in the inventory. Use this order unless the user's answer makes another question more relevant:
   1. Question-and-answer language and existing stack. Read `inventory.responseLocaleDecision` and `inventory.programmingLanguageDecision` after inspection.
      - When `responseLocaleDecision.action` is `apply-codex-setting`, use its `locale` for the interview and catalogue display without asking again. Project settings take precedence over user settings.
      - When `responseLocaleDecision.action` is `ask-user`, first ask which language the user wants for questions and answers: Korean, English, or Other. This is a display and conversation choice, never a programming-language choice.
      - When `programmingLanguageDecision.action` is `preserve-detected`, record every detected programming language as a fixed planning constraint. Do not ask the user to choose or replace it.
      - When no programming language is detected, defer that technical choice to the selected project profile and its catalogue-backed runtime options; do not use the question-and-answer language as a runtime signal.
      - Codex itself applies general user and project settings. Preserve those settings automatically by leaving their files untouched; this Skill only consumes the safe `[project_bootstrap]` response locale returned by the inventory.
   2. Product or service goal and starting profile.
   3. Team size, expected traffic, and operations preference.
   4. Budget sensitivity and regulatory or security requirements.
   5. Do not ask for the display locale again; it was decided as the first question-and-answer language step.
5. Call `list_catalog` and `recommend` after enough context is available. Render the ranked, explainable starting profiles in the Catalog Explorer before presenting the structured choice (or text fallback), and let the user select or comment with an override. When an explorer selection arrives, apply that exact ID as the user override for its current decision before progressing to another question; do not rerank it away or replace it silently. A profile may be overridden one decision at a time; never silently select a technology.
6. Call `validate_selection`. Explain every warning or block with the referenced catalogue IDs and alternatives. If a choice is blocked, ask a replacement question; do not create an implementation plan while blocked rules remain unresolved.
7. Call `create_plan` only after the user explicitly confirms the selection. Present the validation summary, proposed paths, conflict list, generated records, and command list. Ask for approval of that exact file plan before any write.

## Approval gate

Do not create, edit, delete, rename, stage, commit, push, or open a pull request until the user explicitly approves the presented file plan.

After the user approves the exact file plan, execute the approved file generation in the same turn. Do not stop at a hypothetical scaffold, a code block, or a list of proposed files.

1. Recheck the final validation result. If it contains a `block`, do not write; resolve it with the user first.
2. Read [`templates/README.md`](../../templates/README.md) and the mapped template for every approved artifact. Render the template with the reviewed project name, locale, selected IDs, catalogue version, validation result, and execution plan. Never invent unreviewed technology choices while rendering.
3. For every approved artifact whose operation is `create`, create its parent directories and write the real, non-empty file at the exact planned path. Use the workspace file-editing capability (for example, `apply_patch`); do not defer the creation to the user or merely describe the content.
4. Write the selected catalogue version and decisions to `.project-bootstrap/selection.yaml`, then create the decision record, validation report, architecture overview, and execution plan from the reviewed results. Create the approved adapter configuration and interface-contract files as well.
5. Do not create any artifact marked `conflict`. Before every overwrite of an existing non-identical file, stop and request a path-specific overwrite decision. Never delete files or perform an automatic migration.
6. After writing, inspect the resulting paths and report exactly which files were created, which were skipped as conflicts, and which commands remain pending. Do not claim a file was generated unless it exists in the workspace.

Write only the planned non-conflicting local artifacts. Record the selected catalogue version and decisions in:

- `.project-bootstrap/selection.yaml`
- `docs/project-bootstrap/decision-record.md`
- `docs/project-bootstrap/validation-report.md`
- `docs/architecture/overview.md`
- `docs/project-bootstrap/execution-plan.md`

Create `.codex/config.toml`, `AGENTS.md`, container files, and CI files only when they are in the approved plan. Their creation is part of the approved file-generation step, not a later optional suggestion. If a planned path already exists and differs from the generated content, stop and ask for a path-specific overwrite decision. Never delete files or perform automatic migrations.

## Commands and upgrades

Commands are a second approval boundary. List each exact command, its working directory, purpose, network effect, and expected files before running it. If the user explicitly approves the full listed batch, run that batch; otherwise request approval per command. Never run dependency installation, generators, infrastructure initialization, Git commands, or marketplace upgrades merely because a plan has been approved.

Checking or upgrading the marketplace may use the network. Ask before it. Do not send workspace source or bootstrap records to external services.
