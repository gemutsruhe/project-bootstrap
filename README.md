# Codex Project Bootstrap

Codex Project Bootstrap is a public GitHub marketplace containing a desktop-only Codex plugin and a local, read-only MCP server. It helps a user select, validate, document, and safely apply an initial project setup in the **local workspace currently open in Codex**.

It does not send source code to a central service, commit, push, open pull requests, or write files before the user explicitly approves a generated plan.

## What it provides

- A Markdown catalogue of architecture, runtime, data, delivery, security, and AI choices.
- Five starting profiles: full-stack web, API/service, mobile, data/AI, and multi-service platform.
- Deterministic compatibility checks with `pass`, `warning`, and `block` outcomes.
- A local MCP server for inventory, catalogue queries, recommendation, validation, and planning.
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

In Codex Desktop, start Plan mode with `/plan` (or `Shift`+`Tab` where available) and invoke `project-bootstrap`. The Skill asks one decision at a time using the host's selectable choices. Select an option or use **Other** to leave a comment; neither action authorizes any file change. On hosts without structured Plan questions, the same interview is presented as numbered choices with a free-text `Other` response.

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
