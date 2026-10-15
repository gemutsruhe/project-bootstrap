# Template map

Templates provide the bootstrap configuration and documentation layer. After the user approves an exact plan, the `project-bootstrap` Skill must render each approved, non-conflicting template into its planned workspace path in the same turn. It substitutes `{{PROJECT_NAME}}`, `{{LOCALE}}`, `{{SELECTED_IDS}}`, `{{CATALOG_VERSION}}`, and project-specific decisions that the user has reviewed.

Never render a template over an existing non-identical path without a path-specific approval. Do not add secrets, deployment credentials, cloud-provider configuration, generated business logic, or package-install commands. Runtime-standard scaffolds are generated only through their separately approved SDK command.

For the workspace guides, also substitute the normalized guide-policy placeholders for AGENTS, architecture, team, plans, code review, applicable pull requests, workspace settings, and the decision record. For `AGENTS.md`, use `create_plan.agentsGuide.templateValues` exactly for repository map, declared verification commands, managed-path boundaries, local instruction scope, coding conventions, and review-rule guidance. Never invent a command, source root, test root, generated-file rule, nested `AGENTS.md`, or project-specific invariant; surface missing evidence as a confirmation request instead. Each placeholder must render as reviewed, concise Markdown; no placeholder may remain in a generated project file. Project Bootstrap state belongs in `.project-bootstrap/`; it never writes `.codex/config.toml`.

| Planned template key | Source |
| --- | --- |
| `codex-instructions` | `common/AGENTS.md.tmpl` |
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
