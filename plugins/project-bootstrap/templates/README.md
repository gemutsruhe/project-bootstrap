# Template map

Templates provide the bootstrap configuration and documentation layer. After the user approves an exact plan, the `project-bootstrap` Skill must render each approved, non-conflicting template into its planned workspace path in the same turn. It substitutes `{{PROJECT_NAME}}`, `{{LOCALE}}`, `{{SELECTED_IDS}}`, `{{CATALOG_VERSION}}`, and project-specific decisions that the user has reviewed.

Never render a template over an existing non-identical path without a path-specific approval. Do not add secrets, deployment credentials, cloud-provider configuration, generated business logic, or package-install commands. Runtime-standard scaffolds are generated only through their separately approved SDK command.

| Planned template key | Source |
| --- | --- |
| `codex-instructions` | `common/AGENTS.md.tmpl` |
| `codex-project-config` | `common/config.toml.tmpl` |
| `environment-contract` | `common/env.example.tmpl` |
| `local-container-orchestration` | `common/docker-compose.yml.tmpl` |
| `ci-workflow` | `common/ci.yml.tmpl` |
| `architecture-overview` | `common/architecture-overview.md.tmpl` |
| `decision-record`, `validation-report`, `execution-plan` | `common/project-records.md.tmpl` |
| language-specific interface and build keys | matching file under `adapters/` |
| `flutter-standard-scaffold` | Flutter SDK: `flutter create --no-pub --project-name <project_name> .` |
