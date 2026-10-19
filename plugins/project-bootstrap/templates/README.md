# Template map

Templates provide the bootstrap configuration and documentation layer. After the user approves an exact plan, the `project-bootstrap` Skill must render each approved, non-conflicting template into its planned workspace path in the same turn. It substitutes `{{PROJECT_NAME}}`, `{{LOCALE}}`, `{{SELECTED_IDS}}`, `{{CATALOG_VERSION}}`, and project-specific decisions that the user has reviewed.

Never render a template over an existing non-identical path without a path-specific approval. Do not add secrets, deployment credentials, cloud-provider configuration, generated business logic, or package-install commands. Runtime-standard scaffolds are generated only through their separately approved SDK command.

Delivery artifacts, the npm workspace root manifest, the Android UI decision record, and the custom-choice record have no generic template. Write their exact `create_plan.artifacts[].content` only when `operation` is `create` and the user approves that path. An artifact with `operation: deferred` is an unresolved configuration decision: do not write an active file at that path. Do not activate CI solely to check bootstrap records or use an unreviewed runtime version, build command, port, or backing service. These decision records document user choices; they do not provide working integrations.

For ordinary workspace guides, substitute the normalized guide-policy placeholders. For `AGENTS.md`, substitute only `{{AGENTS_DOCUMENT}}` with `create_plan.agentsGuide.markdown` exactly. This localized document implements the reviewed routing, verification and coding policies and the root size budget. Individual `templateValues` remain an inspection API, not an alternative renderer. Planned `agents-evidence` artifacts use their supplied `content` from `agentsGuide.supportingDocuments`; include them only when the exact plan contains them, and review existing paths for conflicts. Commands omitted from a bounded root preview remain in that index. Runtime checks require the evidence described in `skills/project-bootstrap/references/agents-authoring.md`; a declared check is not an execution result or an authorization to run/install tools. Never invent paths, commands, owners, domain rules or a nested guide. Project Bootstrap state belongs in `.project-bootstrap/`; native `.codex/config.toml` remains untouched.

| Planned template key | Source |
| --- | --- |
| `codex-instructions` | `common/AGENTS.md.tmpl` |
| `agents-evidence` | Exact `content` supplied by `create_plan.agentsGuide.supportingDocuments` |
| `architecture-guide` | `common/ARCHITECTURE.md.tmpl` |
| `team-guide` | `common/TEAM_GUIDE.md.tmpl` |
| `planning-guide` | `common/PLANS.md.tmpl` |
| `code-review-guide` | `common/CODE_REVIEW.md.tmpl` |
| `environment-contract` | `common/env.example.tmpl` |
| `local-container-orchestration` | Exact `create_plan.artifacts[].content`, only when ready |
| `ci-workflow` | Exact `create_plan.artifacts[].content`, only when ready |
| `npm-workspace-root` | Exact `create_plan.artifacts[].content`, only when ready |
| `custom-choice-record` | Exact `create_plan.artifacts[].content`, only when a custom technology is selected |
| `android-ui-decision` | Exact `create_plan.artifacts[].content`, only when native Android is selected |
| `pull-request-template` | `common/pull-request-template.md.tmpl` |
| `architecture-overview` | `common/architecture-overview.md.tmpl` |
| `decision-record`, `validation-report`, `execution-plan` | `common/project-records.md.tmpl` |
| language-specific interface and build keys | matching file under `adapters/` |
| `flutter-standard-scaffold` | Flutter SDK: `flutter create --no-pub --project-name <project_name> .` |
| `expo-standard-scaffold` | Expo CLI: `npx create-expo-app@latest . --template default --no-agents-md --yes` |
| Next.js standard scaffold | Approved `create_plan.scaffolds[].command` at the reviewed `applicationPath` |
