---
name: project-bootstrap
description: Inspect a local project, recommend and validate its architecture and platform setup, then generate approved bootstrap artifacts. Use for new or existing projects; require explicit approval before file changes.
---

# Project Bootstrap

Use the bundled `project-bootstrap` MCP server to keep selection, validation, and planning deterministic. Its tools are read-only. Treat its output as a proposal until the user approves the exact file plan; after that approval, this Skill creates the approved local bootstrap artifacts itself.

## Guided interview and selection

1. Call `inspect_workspace` for the target workspace before asking for details that the inventory can determine. For an existing project, preserve detected programming languages, runtimes, manifests, deployment configuration, Codex settings, and user-owned files unless the user explicitly asks to replace them. The inventory returns only a redacted summary of legacy Project Bootstrap response-locale preferences in applicable user and project Codex configs; never request, echo, copy, or rewrite raw Codex configuration. If `inventory.truncated` is true, re-inspect with enough depth and capacity before requesting a file plan. If `inventory.accessScope.mode` is `host-boundary-not-configured`, disclose that the host did not provide `PROJECT_BOOTSTRAP_ALLOWED_ROOT`; do not claim inspection is path-restricted.
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
      - Codex itself applies general user and project settings. Preserve those settings automatically by leaving their files untouched; this Skill only consumes a legacy safe `[project_bootstrap]` response locale when one already exists. Never create that table; record new Project Bootstrap choices in `.project-bootstrap/selection.yaml`.
   2. Product or service goal and starting profile.
   3. Team size, expected traffic, and operations preference.
   4. Budget sensitivity and regulatory or security requirements.
   5. Do not ask for product features, user workflows, acceptance criteria, or implementation details. The product goal is only a profile-recommendation input; this workflow generates a base project setup rather than product functionality.
   6. Do not ask for the display locale again; it was decided as the first question-and-answer language step.
5. Call `list_catalog` and `recommend` after enough context is available. Render the ranked, explainable starting profiles in the Catalog Explorer before presenting the structured choice (or text fallback), and let the user select or comment with an override. When an explorer selection arrives, apply that exact ID as the user override for its current decision before progressing to another question; do not rerank it away or replace it silently. A profile may be overridden one decision at a time; never silently select a technology.
6. Call `validate_selection`. Explain every warning or block with the referenced catalogue IDs and alternatives. If a choice is blocked, ask a replacement question; do not create an implementation plan while blocked rules remain unresolved.
7. After catalogue selections are valid and before creating the file plan, configure the planned workspace-guide bundle. Call `list_workspace_guide_policies` and read [workspace-guide-interview.md](references/workspace-guide-interview.md) at this point. When configuring `AGENTS.md`, also read [agents-authoring.md](references/agents-authoring.md). The MCP tool is the authoritative list of profile IDs, defaults, and allowed fields; do not invent values.
   - First ask one collaboration-host decision: no hosted PR workflow, GitHub, GitLab, or Other/existing host. Record it as `workspaceSettings.collaborationHost`. A GitHub Actions catalogue choice does not by itself authorize a GitHub PR template.
   - Ask the profile question for one applicable guide at a time, in this order: AGENTS.md, ARCHITECTURE.md, TEAM_GUIDE.md, PLANS.md, and CODE_REVIEW.md. Ask `.github/pull_request_template.md` only when `collaborationHost` is `github`. Do not present all questions at once.
   - For `AGENTS.md`, ask the routing profile first, then ask the coding-convention baseline, function-design rule, and comment rule one decision at a time. Use the MCP policy's recommended values as the first structured choices. Do not infer stylistic rules from a programming language alone: preserve detected local patterns where they exist, and let the user choose a baseline for a new project.
   - Retain the user's free-text comment, and ask its focused follow-up only when the user selects a `custom` profile or field value, or leaves a comment that changes the default. A custom AGENTS rule must name the affected scope, the invariant or convention, and the safe alternative; do not record secrets, identities, or provider-specific instructions.
   - Record answers as the MCP policy object's guideDecisions keys. Do not ask for secrets, personal data, individual names, or production credentials. Do not let an answer weaken the Skill's approval gates.
8. Call create_plan only after the user explicitly confirms the catalogue selection, workspace settings, and applicable guide decisions. Pass both `guideDecisions` and `workspaceSettings`. Re-inspect the workspace first when needed so existing files are never silently replaced. Present the validation summary, reviewed guide decisions, `agentsGuide` evidence and template preview, configuration review, bootstrap artifact paths, `conflict` and `merge-preview` paths, generated records, runtime scaffold plan, hosted manual settings, and command list. If `agentsGuide.status` is `needs-confirmation`, ask the user to correct or confirm its missing evidence before asking for file-plan approval. Ask for approval of that exact file plan before any write.

## Approval gate

Do not create, edit, delete, rename, stage, commit, push, or open a pull request until the user explicitly approves the presented file plan.

After the user approves the exact file plan, execute the approved file generation in the same turn. Do not stop at a hypothetical scaffold, a code block, or a list of proposed files.

1. Recheck the final validation result. If it contains a `block`, do not write; resolve it with the user first.
2. Read [`templates/README.md`](../../templates/README.md) and the mapped template for every approved bootstrap artifact. Render the template with the reviewed project name, locale, selected IDs, catalogue version, validation result, execution plan, workspaceSettings, and reviewed guideDecisions. Render every guide-decision placeholder as concise Markdown derived from the normalized MCP policy result. For `AGENTS.md`, render `AGENTS_REPOSITORY_MAP`, `AGENTS_VERIFICATION_COMMANDS`, `AGENTS_BOUNDARIES`, `AGENTS_LOCAL_GUIDANCE`, `AGENTS_CODING_CONVENTIONS`, and `AGENTS_REVIEW_RULES` directly from the approved `agentsGuide.templateValues`; never leave an unresolved placeholder or invent unreviewed technology choices while rendering.
3. For every approved artifact whose operation is `create`, create its parent directories and write the real, non-empty file at the exact planned path. Use the workspace file-editing capability (for example, `apply_patch`); do not defer the creation to the user or merely describe the content.
4. Write the selected catalogue version, catalogue decisions, workspaceSettings, and reviewed guideDecisions to `.project-bootstrap/selection.yaml`, then create the decision record, validation report, architecture overview, execution plan, and approved Codex workspace guide bundle from the reviewed results. The bundle is `AGENTS.md`, `ARCHITECTURE.md`, `TEAM_GUIDE.md`, `PLANS.md`, and `CODE_REVIEW.md`; update `AGENTS.md` so it tells Codex when each guide is relevant. Create the approved adapter configuration and interface-contract files as well.
5. Do not create any artifact marked `conflict` or `merge-preview`. Before every overwrite, replacement, or merge of an existing non-identical file, stop and request a path-specific decision. Never delete files or perform an automatic migration.
6. After writing, inspect the resulting paths and report exactly which files were created, which were skipped as conflicts, and which commands remain pending. Do not claim a file was generated unless it exists in the workspace.

Write only the planned non-conflicting local artifacts. Record the selected catalogue version and decisions in:

- `.project-bootstrap/selection.yaml`
- `docs/project-bootstrap/decision-record.md`
- `docs/project-bootstrap/validation-report.md`
- `docs/architecture/overview.md`
- `docs/project-bootstrap/execution-plan.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `TEAM_GUIDE.md`
- `PLANS.md`
- `CODE_REVIEW.md`

`AGENTS.md` is the project-scoped Codex instruction entry point. The architecture, team, planning, and review guides are repository conventions referenced by `AGENTS.md`; do not claim that Codex automatically discovers them independently. Never create or rewrite `.codex/config.toml`; native Codex configuration remains outside this plugin's generated state. Create `.github/pull_request_template.md` only when the approved workspace settings select GitHub and the approved guide decisions include a pull-request policy. Create container and CI files only when their matching catalogue delivery option is selected. Do not create optional `.codex/skills/`, `AGENTS.override.md`, `CODEOWNERS`, or organization-specific policy files unless the user explicitly asks for them. If a planned path already exists or requires `merge-preview`, stop and ask for a path-specific decision. Never delete files or perform automatic migrations.

## Bootstrap scope

Generate only the approved base setup: Codex workspace guides, configuration, environment contracts, architecture and interface drafts, project records, optional container, CI, and pull-request files, language-specific build or analysis configuration, and the selected runtime's standard project scaffold where the plan supports one. Do not create product-specific screens, API endpoints, business logic, database schemas, sample user flows, or feature tests. Product implementation is a separate user request after bootstrap.

For a new Flutter selection, ask for the project name only if it cannot be inferred from the workspace name, then include the planned `flutter create --no-pub --project-name <project_name> .` command and its standard output paths. This produces Flutter's canonical `pubspec.yaml`, `lib/`, `test/`, and platform directories instead of hand-writing a reduced imitation. The file-plan approval does not authorize this command: run it only after the user separately approves the exact command. If the workspace already has a Flutter scaffold, preserve it and do not run `flutter create`.

## Commands and upgrades

Commands are a second approval boundary. List each exact command, its working directory, purpose, network effect, and expected files before running it. If the user explicitly approves the full listed batch, run that batch; otherwise request approval per command. Never run dependency installation, generators, infrastructure initialization, Git commands, or marketplace upgrades merely because a plan has been approved.

Checking or upgrading the marketplace may use the network. Ask before it. Do not send workspace source or bootstrap records to external services.
