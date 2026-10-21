# Codex Project Bootstrap

Codex Project Bootstrap is a public GitHub marketplace containing desktop-only Codex plugins and local, read-only MCP servers for the **local workspace currently open in Codex**.

- **Project Bootstrap** selects, validates, documents, and safely applies an initial project setup.
- **Project Maintenance** assesses an existing implementation or configuration, then applies only explicitly approved, targeted improvements.

Neither plugin sends source code to a central service, commits, pushes, opens pull requests, or writes files before the user explicitly approves a generated plan.

## What it provides

- A Markdown catalogue of architecture, runtime, data, delivery, security, and AI choices.
- Seven starting profiles: interactive mockup, full-stack web, API/service, cross-platform mobile, native Android, data/AI, and multi-service platform.
- Common starting templates with per-decision overrides, including a user-defined choice for languages, databases, frameworks, tools, UI architectures, and state-management libraries.
- Deterministic compatibility checks with `pass`, `warning`, and `block` outcomes.
- A local MCP server for inventory, catalogue queries, recommendation, validation, planning, optional read-only implementation assessment, and a Catalog Explorer UI.
- A Codex Skill that renders approved bootstrap artifacts and invokes supported standard runtime scaffolds after explicit approval gates.

## Target-scoped platform choices (selection v2)

`list_platform_choices` exposes release-pinned decisions for web, API, native Android, Expo, Flutter, native iOS, desktop, and data/AI targets. Each option includes its role, recommendation rationale, source URL and observation date, version baseline, and generation state. Stack Overflow survey data supports usage claims for frameworks and databases; platform architecture defaults are grounded in the corresponding official guidance, not presented as Stack Overflow architecture rankings.

Pass `{ "version": 2, "targets": [{ "id": "web", "platformId": "web", "path": "apps/web", "useDefaults": true, "choices": { "state": "web.zustand" } }] }` as `selection` to `validate_selection` and then `create_plan`. Setting `useDefaults: true` means the user accepted the displayed defaults for unfilled required slots. Optional authentication, observability, and delivery integrations are unselected; their `conditional-review` state pauses runnable generation until a provider- or host-specific integration is separately reviewed. Custom choices likewise pause generation while official documentation or registry metadata is researched with the user's permission.

The v2 plan is read-only and lists exact file contents, commands, source evidence, and not-run checks. Existing target files are conflicts; an existing project enters `migration-review` and is never changed automatically. Flutter's SDK generator is a separate first phase, followed by reinspection and path-specific overlay review. Native iOS generation and Xcode checks are deferred outside macOS. File writes, dependency installation, SDK commands, and online research remain separate approvals. Standard candidates are marked `verified-recipe` after the pull-request platform smoke matrix passed 47/47 jobs and the macOS iOS matrix passed 3/3 jobs; this does not grant approval to write or run their recipes. Optional OIDC, observability, and delivery integrations remain `conditional-review`. The macOS iOS smoke workflow is `.github/workflows/ios-recipe-smoke.yml`; `.github/workflows/recipe-smoke.yml` covers web, API, Expo, desktop, Flutter, Android, and data recipes. Both run on pull requests and can be started manually; candidates return to `recipe-preview` if their recipe or supported version changes before a new platform check passes. `versionBaseline` is not an assertion that a build passed on the current host.

The catalogue is English by default. A caller can request Korean display strings with `locale: "ko"`; stable IDs remain English.

## Install from GitHub

After publishing this repository to GitHub, add it as a Codex marketplace (replace the placeholder):

```powershell
codex plugin marketplace add <OWNER>/<REPOSITORY>
```

Install **Project Bootstrap** for initial setup or **Project Maintenance** for an existing project from the marketplace in Codex Desktop. Both require Node.js 20 or later but have no npm or Python runtime dependency.

> This is a local-MCP plugin. It is intended for Codex Desktop and local Codex tasks, not the public Plugins Directory.

## Guided planning

For an existing project, start Plan mode and invoke `project-maintenance`. It inventories the local workspace and assesses implementation or configuration evidence without making changes. To address a finding, it first presents a focused, path-specific repair plan; file edits and verification commands each require separate approval.

In Codex Desktop, start Plan mode with `/plan` (or `Shift`+`Tab` where available) and invoke `project-bootstrap`. The Skill asks one decision at a time using the host's selectable choices. It first identifies the product or service form, then the current delivery target: an interactive mockup, an MVP, or a production foundation. Team size, traffic, and operations questions are deferred until an MVP or production target needs them. Select an option or use **Other** to leave a comment; neither action authorizes any file change. For catalogue-backed candidates, the Catalog Explorer MCP UI displays the ranked candidate cards alongside their packaged source Markdown. Submitting an explorer candidate makes that ID the user’s choice for the current decision, retains unrelated earlier choices, then continues with validation or the next relevant candidates. It is an inline plugin view, not a host-native split tab. On hosts without structured Plan questions or MCP Apps UI, the same interview is presented as numbered choices with a free-text `Other` response and catalogue paths in the response.

After the user approves the exact generated file plan, the Skill immediately renders and writes every approved non-conflicting bootstrap artifact: project records, architecture and interface drafts, and approved adapter configuration. The default workspace-guide bundle is `AGENTS.md`, `ARCHITECTURE.md`, `TEAM_GUIDE.md`, `PLANS.md`, and `CODE_REVIEW.md`; `AGENTS.md` links to the appropriate guide by task type, so routine changes do not need every document. Only `AGENTS.md` is a Codex instruction entry point; the other guide files are explicit repository conventions rather than independently auto-discovered Codex settings. Compose and CI files require their matching catalogue delivery option. A GitHub pull-request template additionally requires an explicit GitHub collaboration-host choice and a pull-request guide decision. The plugin never creates or rewrites `.codex/config.toml`.

### Common template or custom stack

Each profile offers a small `template.ids` starting set, not a required technology bundle. The user can keep, replace, or omit individual choices. For a new project, the interview presents relevant catalogue alternatives and a **Specify another technology** option for a language, database, framework, or tool. A custom entry records its exact name, purpose, scope, and any replaced catalogue ID in `customChoices`; it is documented in the plan and `docs/project-bootstrap/custom-choices.md`. It does not cause the plugin to invent a scaffold, dependency, database service, or verification command. A custom pnpm/Yarn/Bun choice blocks the npm-only Next.js scaffold until a matching command is separately reviewed. Existing projects preserve the detected stack by default.

For native Android, the interview separates the platform (`mobile.android-native`), UI architecture (`android.ui.mvvm` or `android.ui.mvi`), and state-management implementation (`android.state.jetpack`, `android.state.mavericks`, or `android.state.orbit`). The common Android template starts with Kotlin, MVVM, and Jetpack ViewModel/StateFlow. These are replaceable decisions, not an automatic library installation. A different architecture or library can be recorded as a scoped custom choice. Native Android scaffolding and Gradle dependency edits are not yet generated; an existing Android project is preserved, and the generic JVM build template is not substituted for it. This follows Android's [ViewModel and unidirectional-state-flow guidance](https://developer.android.com/topic/architecture/recommendations) while keeping [Mavericks](https://github.com/airbnb/mavericks) and [Orbit](https://github.com/orbit-mvi/orbit-mvi) opt-in alternatives.

The templates favor broadly used, relatively small starting combinations rather than optional infrastructure by default. PostgreSQL is the baseline relational database for applicable profiles; SQLite and MySQL are selectable alternatives. This is informed by the [2026 Stack Overflow Developer Survey](https://survey.stackoverflow.co/2026/technology), which ranks PostgreSQL, SQLite, and MySQL as its three most-used databases and shows JavaScript, Python, and TypeScript among widely used languages. Survey popularity is one input, not a claim that one stack fits every project; the user's requirements and existing code take precedence.

### Configuring workspace guides

After the catalogue choices are validated, Project Bootstrap opens the **Workspace Guide Configurator** for one applicable guide at a time instead of repeating separate profile and field prompts. The editor exposes the guide's supported policy profiles and detailed fields, preserves the custom-policy explanation path, and lets users add structured `AGENTS.md` rules with a repository-relative scope, invariant, and safe alternative. Existing user-confirmed command declarations are shown read-only and are retained when the guide is saved; users return to the command-declaration interview to alter them. Each submission is validated and returned as planning input for the active chat only; it does not persist settings by itself, edit local files, run commands, modify `.codex/config.toml`, or change GitHub/GitLab settings. The existing file-plan and command approval gates still apply.

New runtime scaffolds are a deliberate two-phase workflow. The plan first presents the separately approved generator command for an empty workspace. Once it completes, the Skill re-inspects the real manifest, source roots, and declared scripts, then presents a fresh artifact plan. This prevents generators from colliding with bootstrap documents or leaving guidance that describes a pre-scaffold workspace. Flutter uses `flutter create --no-pub --project-name <project_name> .`, while Expo uses `npx create-expo-app@latest . --template default --no-agents-md --yes`. The Expo command downloads the generator, template, and dependencies, so it requires network access and a preinstalled Node.js LTS runtime. A new Next.js project can use the root, or `apps/web` when a monorepo is explicitly selected; the path is reviewed before planning and its generator does not install application dependencies or initialize Git. A nested npm workspace receives a separately reviewed root manifest and `npm install` command after reinspection. This workflow does not ask for or implement product-specific features. A file-plan approval still does not authorize dependency installation, generators, Git, cloud actions, external API calls, or any other command; those require a separate command approval.

Selected CI and Compose options are not automatically active files. CI is generated only when a root npm manifest and lockfile expose test/build scripts and a Node.js version has been reviewed. Compose requires a root Dockerfile, `.env.example`, and reviewed port; its baseline does not assume a missing `.env` file exists. PostgreSQL needs a separate service design. Otherwise the plan marks the artifact `deferred` and writes no workflow or Compose file, avoiding a misleading green check or an unrunnable local stack.

### Reviewing an implementation

When asked to evaluate an app against explicit acceptance criteria, the read-only `assess_implementation` tool indexes supplied evidence paths, declared checks, caller-reported results, agent-executed results, documentation drift, and context-specific review prompts. It never runs checks or treats file presence as behavioral proof. The Skill then inspects relevant code and tests, distinguishes declared, reported, and actually executed checks, and marks unproven criteria as unverified. This assessment is separate from bootstrap and does not authorize product edits.

For a full evidence audit, callers can provide policy entry documents through `policyAudit`, or simply ask Project Maintenance to **start a full audit** (`전수감사 시작`). The one-command route uses `policyAudit.scope: "auto"` to select conventionally named policy and instruction documents, reports that selection, and then follows only their direct local policy-document references. The tool returns stable sentence/list-item IDs with source lines and heading context, and paginates results without silently omitting later items. The Skill retrieves every page before reporting an item-by-item verdict; a blocked collection or stale page token is not a coverage conclusion. Configuration evidence is limited to paths, keys, scopes, and safe state classifications—never raw values or environment variables. Verification commands remain a separate approval: only an authorized, actually run command may be supplied as `executedChecks`, while caller-reported results remain visible as caller-reported.

### Existing projects and Codex settings

For an existing workspace, the inventory preserves detected programming languages and does not ask the user to replace them. It records the relevant guide, PR-template, CODEOWNERS, and native Codex-config paths without returning raw configuration. A truncated inventory cannot produce a file plan. When the host provides `PROJECT_BOOTSTRAP_ALLOWED_ROOT`, inspection rejects roots outside it; otherwise the response explicitly reports that the host has not configured an inspection boundary.

Codex continues to apply its ordinary settings itself. For backward compatibility the plugin can read, but never writes, this legacy optional Project Bootstrap preference:

```toml
[project_bootstrap]
locale = "ko" # Korean question-and-answer language; use en for English
```

`locale` controls the language used for questions, answers, and catalogue display. If no legacy preference is present, the Skill asks for the preferred question-and-answer language before asking about the product profile. New choices are stored in `.project-bootstrap/selection.yaml`, not `.codex/config.toml`. Programming languages are inferred from the workspace or selected later through the project profile; they are never inferred from the response language. Existing configuration files are never copied, changed, or overwritten by the inventory.

### Workspace-guide configuration

Before the file plan is created, the Skill first records the collaboration host, then configures each applicable workspace guide progressively: AGENTS.md, ARCHITECTURE.md, TEAM_GUIDE.md, PLANS.md, and CODE_REVIEW.md. It asks about the GitHub pull-request template only when GitHub was selected. For AGENTS.md, the inventory supplies a local-only evidence preview: detected repository areas, declared verification-script names (never script bodies), lockfiles, generated-file hints, and existing instruction paths. The plan renders only that reviewed evidence, so it never invents a command or a nested guide. It then asks independently for the coding baseline, function-design rule, and comment convention: existing project patterns are the default, while modular-boundary and functional-core policies remain explicit user choices. Project-specific review rules must name a confirmed scope, invariant, and safe path; formatting and other mechanical checks remain in tooling or CI. The MCP server supplies the versioned policy IDs, allowed fields, and defaults; the Skill asks one guide-policy decision at a time and offers an Other/comment response. The reviewed answers are validated, included in the read-only plan, written to the bootstrap decision record after file-plan approval, and rendered into the generated guide rather than remaining as placeholders. Branch protection, rulesets, required approvals, and CODEOWNERS enforcement remain host-managed manual settings.

## Development

### Evidence-based AGENTS generation

The planner renders the complete Korean or English root guide in `agentsGuide.markdown`. Routing and full-suite/affected-check policies change the actual instructions, while minimal routing removes optional sections. Service, multi-package, SDK, data, AI and generated-output rules compose from independent evidence rather than competing for a single template slot.

Verification evidence is tracked per project area. Node scripts retain the nearest package-manager choice; Flutter, configured Python tooling, Go, JVM wrappers and .NET have bounded check adapters. Every command records its scope, effects and `not-run` status. Watchers, fixers, live calls and publication commands are not default verification checks. Missing commands remain visible; Rust, Swift, plain Dart and Terraform are detected but do not receive invented checks. User-confirmed commands, scoped invariants and project context can be recorded using the guide-policy catalogue's structured fields.

Root guides have a 16 KiB generation budget. Large path/command inventories are routed to a separately planned `docs/project-bootstrap/agents-evidence.md`, retaining per-area gaps and the complete collected commands. Metadata collection limits and unreadable manifests are explicit, and an existing `AGENTS.override.md` triggers a merge preview. The plugin preserves Maven/Groovy builds and checks manifest evidence before treating an app as an existing Flutter or Expo scaffold.

The regression suite exercises real temporary workspaces, runtime-specific fixtures, mixed-language repositories, policy/locale combinations, command effects, manifest limits and bounded document rendering. It tests guide generation; it does not install SDKs or run generated applications.

The repository has no package dependencies. Node's built-in test runner is enough:

```powershell
node scripts/build.mjs
node scripts/validate-catalog.mjs
node --test server/test/*.test.js
```

`scripts/build.mjs` refreshes the committed runtime artifact at `plugins/project-bootstrap/server/dist/index.js`. Run it whenever `server/src/` changes.

The test suite covers both a clean Expo root-scaffold plan and the safety case where an existing populated workspace must not be turned into a nested app.

## Repository layout

- `.agents/plugins/marketplace.json` — Codex marketplace entry.
- `plugins/project-bootstrap/` — portable plugin, Skill, local MCP configuration, catalogue, and templates.
- `server/src/` — dependency-free Node implementation of the MCP protocol and planning engine.
- `server/test/` — unit and integration-style tests using workspace fixtures.

## Publishing notes

Tag releases with semantic versions and update the plugin manifest version in the same change. Users are notified about version changes and choose whether to upgrade; the plugin never auto-upgrades itself. A local MCP must be packaged with its runtime artifact and may require additional platform approval if it is later submitted to OpenAI's public plugin directory.
