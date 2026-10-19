# Catalogue schema

Each selectable Markdown record starts with a flat YAML frontmatter block. The dependency-free MCP parser intentionally supports scalars, booleans, integers, and bracket lists.

Required keys are `id`, `kind`, `title_en`, and `summary_en`. Optional localized fields use `title_ko` and `summary_ko`.

Use `requires`, `requires_any`, `conflicts`, and `warns_with` for stable-ID rules. Every referenced ID must exist. `suggests` gives a profile's non-binding starting set.

Use distinct kinds for separate decisions: `architecture` describes repository/service topology, `mobile` describes the platform, `ui-architecture` describes UI state flow, and `state-management` describes its implementation. A library must not be presented as the architecture pattern itself. For native Android, select `mobile.android-native` and `language.kotlin` before a UI-architecture and state-management choice. Existing projects preserve their detected implementation; catalogue choices alone do not install dependencies or generate a native Android application.

Profile entries may declare `stages` as a bracket list containing one or more of `mockup`, `mvp`, and `production`. The recommender uses it with the user's current delivery target; it never selects a profile automatically. Never encode write commands or secrets in the catalogue.

## Target-scoped platform catalogue (selection v2)

`server/src/platform-catalog.js` is the release-pinned source for version-2 platform slots. Each option has a stable ID, role-specific slot, rationale, version baseline, evidence URL/type/observation date, and generation state. `recipe-preview` means a concrete file recipe exists but platform build verification is still pending; `conditional-review` means provider or host details must be reviewed before any runnable integration plan. The local MCP tools expose this through `list_platform_choices`; legacy Markdown IDs and saved selections remain readable.

The v2 wire shape is `{ version: 2, targets: [{ id, platformId, path, choices, useDefaults?, customChoices? }] }`. A choice belongs to exactly one target and slot; a target path is workspace-relative. Missing required slots block unless the user explicitly accepts their defaults. Generated artifacts are planned by `server/src/platform-recipes.js`, while `server/src/platform-selection.js` checks combinations and environment constraints. Survey usage evidence must not be described as measuring architecture-pattern or library popularity when the survey does not ask that question.
