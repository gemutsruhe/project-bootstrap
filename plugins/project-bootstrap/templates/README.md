# Template map

Templates provide the bootstrap configuration and documentation layer. After the user approves an exact plan, the `project-bootstrap` Skill must render each approved, non-conflicting template into its planned workspace path in the same turn. It substitutes `{{PROJECT_NAME}}`, `{{LOCALE}}`, `{{SELECTED_IDS}}`, `{{CATALOG_VERSION}}`, and project-specific decisions that the user has reviewed.

Never render a template over an existing non-identical path without a path-specific approval. Do not add secrets, deployment credentials, cloud-provider configuration, generated business logic, or package-install commands. Runtime-standard scaffolds are generated only through their separately approved SDK command.

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
| `local-container-orchestration` | `common/docker-compose.yml.tmpl` |
| `ci-workflow` | `common/ci.yml.tmpl` |
| `pull-request-template` | `common/pull-request-template.md.tmpl` |
| `architecture-overview` | `common/architecture-overview.md.tmpl` |
| `decision-record`, `validation-report`, `execution-plan` | `common/project-records.md.tmpl` |
| language-specific interface and build keys | matching file under `adapters/` |
| `flutter-standard-scaffold` | Flutter SDK: `flutter create --no-pub --project-name <project_name> .` |
| `expo-standard-scaffold` | Expo CLI: `npx create-expo-app@latest . --template default --no-agents-md --yes` |
