# Catalogue schema

Each selectable Markdown record starts with a flat YAML frontmatter block. The dependency-free MCP parser intentionally supports scalars, booleans, integers, and bracket lists.

Required keys are `id`, `kind`, `title_en`, and `summary_en`. Optional localized fields use `title_ko` and `summary_ko`.

Use `requires`, `requires_any`, `conflicts`, and `warns_with` for stable-ID rules. Every referenced ID must exist. `suggests` gives a profile's non-binding starting set.

Profile entries may declare `stages` as a bracket list containing one or more of `mockup`, `mvp`, and `production`. The recommender uses it with the user's current delivery target; it never selects a profile automatically. Never encode write commands or secrets in the catalogue.
