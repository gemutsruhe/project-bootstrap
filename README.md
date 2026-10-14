# Codex Project Bootstrap

Codex Project Bootstrap is a public GitHub marketplace containing a desktop-only Codex plugin and a local, read-only MCP server. It helps a user select, validate, document, and safely apply an initial project setup in the **local workspace currently open in Codex**.

It does not send source code to a central service, commit, push, open pull requests, or write files before the user explicitly approves a generated plan.

## What it provides

- A Markdown catalogue of architecture, runtime, data, delivery, security, and AI choices.
- Five starting profiles: full-stack web, API/service, mobile, data/AI, and multi-service platform.
- Deterministic compatibility checks with `pass`, `warning`, and `block` outcomes.
- A local MCP server for inventory, catalogue queries, recommendation, validation, planning, and a read-only Catalog Explorer UI.
- A Codex Skill that keeps filesystem changes and command execution behind an explicit approval gate.

The catalogue is English by default. A caller can request Korean display strings with `locale: "ko"`; stable IDs remain English.

## Install from GitHub

After publishing this repository to GitHub, add it as a Codex marketplace (replace the placeholder):

```powershell
codex plugin marketplace add <OWNER>/<REPOSITORY>
```

Install **Project Bootstrap** from the marketplace in Codex Desktop, then start a local Codex task in the project you want to configure. The plugin requires Node.js 20 or later but has no npm or Python runtime dependency.

> This is a local-MCP plugin. It is intended for Codex Desktop and local Codex tasks, not the public Plugins Directory.

## Guided planning

In Codex Desktop, start Plan mode with `/plan` (or `Shift`+`Tab` where available) and invoke `project-bootstrap`. The Skill asks one decision at a time using the host's selectable choices. Select an option or use **Other** to leave a comment; neither action authorizes any file change. For catalogue-backed candidates, the Catalog Explorer MCP UI displays the ranked candidate cards alongside their packaged source Markdown, and submits a selected ID and optional comment back to chat. It is an inline plugin view, not a host-native split tab. On hosts without structured Plan questions or MCP Apps UI, the same interview is presented as numbered choices with a free-text `Other` response and catalogue paths in the response.

### Existing projects and Codex settings

For an existing workspace, the inventory preserves detected languages and does not ask the user to replace them. It also checks the user-level Codex configuration (`$CODEX_HOME/config.toml`, normally `~/.codex/config.toml`) and the project-level `.codex/config.toml` without returning their raw contents. Project values take precedence over user values.

Codex continues to apply its ordinary settings itself. The plugin only reads these optional, non-sensitive Project Bootstrap defaults:

```toml
[project_bootstrap]
language = "language.typescript" # TypeScript, Python, Java, Kotlin, Go, .NET, or Flutter
locale = "ko"                    # en or ko
```

`language` may also use the short value, such as `typescript` or `python`. A detected project language always wins over this default. If neither detection nor an applicable language default is available, the Skill asks for the preferred language before asking about the product profile. Existing configuration files are never copied, changed, or overwritten by the inventory.

## Development

The repository has no package dependencies. Node's built-in test runner is enough:

```powershell
node scripts/build.mjs
node scripts/validate-catalog.mjs
node --test server/test/*.test.js
```

`scripts/build.mjs` refreshes the committed runtime artifact at `plugins/project-bootstrap/server/dist/index.js`. Run it whenever `server/src/` changes.

## Repository layout

- `.agents/plugins/marketplace.json` — Codex marketplace entry.
- `plugins/project-bootstrap/` — portable plugin, Skill, local MCP configuration, catalogue, and templates.
- `server/src/` — dependency-free Node implementation of the MCP protocol and planning engine.
- `server/test/` — unit and integration-style tests using workspace fixtures.

## Publishing notes

Tag releases with semantic versions and update the plugin manifest version in the same change. Users are notified about version changes and choose whether to upgrade; the plugin never auto-upgrades itself. A local MCP must be packaged with its runtime artifact and may require additional platform approval if it is later submitted to OpenAI's public plugin directory.
