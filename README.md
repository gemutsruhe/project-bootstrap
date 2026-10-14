# Codex Project Bootstrap

Codex Project Bootstrap is a public GitHub marketplace containing a desktop-only Codex plugin and a local, read-only MCP server. It helps a user select, validate, document, and safely apply an initial project setup in the **local workspace currently open in Codex**.

It does not send source code to a central service, commit, push, open pull requests, or write files before the user explicitly approves a generated plan.

## What it provides

- A Markdown catalogue of architecture, runtime, data, delivery, security, and AI choices.
- Five starting profiles: full-stack web, API/service, mobile, data/AI, and multi-service platform.
- Deterministic compatibility checks with `pass`, `warning`, and `block` outcomes.
- A local MCP server for inventory, catalogue queries, recommendation, validation, planning, and a read-only Catalog Explorer UI.
- A Codex Skill that renders approved bootstrap artifacts and invokes supported standard runtime scaffolds after explicit approval gates.

The catalogue is English by default. A caller can request Korean display strings with `locale: "ko"`; stable IDs remain English.

## Install from GitHub

After publishing this repository to GitHub, add it as a Codex marketplace (replace the placeholder):

```powershell
codex plugin marketplace add <OWNER>/<REPOSITORY>
```

Install **Project Bootstrap** from the marketplace in Codex Desktop, then start a local Codex task in the project you want to configure. The plugin requires Node.js 20 or later but has no npm or Python runtime dependency.

> This is a local-MCP plugin. It is intended for Codex Desktop and local Codex tasks, not the public Plugins Directory.

## Guided planning

In Codex Desktop, start Plan mode with `/plan` (or `Shift`+`Tab` where available) and invoke `project-bootstrap`. The Skill asks one decision at a time using the host's selectable choices. Select an option or use **Other** to leave a comment; neither action authorizes any file change. For catalogue-backed candidates, the Catalog Explorer MCP UI displays the ranked candidate cards alongside their packaged source Markdown. Submitting an explorer candidate makes that ID the user’s choice for the current decision, retains unrelated earlier choices, then continues with validation or the next relevant candidates. It is an inline plugin view, not a host-native split tab. On hosts without structured Plan questions or MCP Apps UI, the same interview is presented as numbered choices with a free-text `Other` response and catalogue paths in the response.

After the user approves the exact generated file plan, the Skill immediately renders and writes every approved non-conflicting bootstrap artifact: project records, architecture and interface drafts, approved adapter configuration, and optional Codex, container, and CI files. It also lists the standard runtime scaffold command, its expected output paths, and its side effects. For example, a new Flutter selection offers `flutter create --no-pub --project-name <project_name> .` to generate the standard files and platform directories created by Flutter tooling and Android Studio; it runs only after separate command approval. This workflow does not ask for or implement product-specific features. A file-plan approval still does not authorize dependency installation, generators, Git, cloud actions, external API calls, or any other command; those require a separate command approval.

### Existing projects and Codex settings

For an existing workspace, the inventory preserves detected programming languages and does not ask the user to replace them. It also checks the user-level Codex configuration (`$CODEX_HOME/config.toml`, normally `~/.codex/config.toml`) and the project-level `.codex/config.toml` without returning their raw contents. Project values take precedence over user values.

Codex continues to apply its ordinary settings itself. The plugin only reads these optional, non-sensitive Project Bootstrap defaults:

```toml
[project_bootstrap]
locale = "ko" # Korean question-and-answer language; use en for English
```

`locale` controls the language used for questions, answers, and catalogue display. If no effective locale is configured, the Skill asks for the preferred question-and-answer language before asking about the product profile. Programming languages are inferred from the workspace or selected later through the project profile; they are never inferred from the response language. Existing configuration files are never copied, changed, or overwritten by the inventory.

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
