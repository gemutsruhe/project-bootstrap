# Workspace guide configuration interview

Read this reference only after the catalogue selection is valid and before create_plan. Call `list_workspace_guide_policies` first; its schema version, profile IDs, defaults, and field values are authoritative. This reference provides the interview wording and sequencing only.

Ask one question at a time with the host structured-choice control when available. Each question includes Other — describe your policy. Record both the selected profile and any comment. A profile selection only configures the pending plan; it never approves file writes or commands.

## Decision object

Pass the collected objects to `create_plan` as `workspaceSettings` and `guideDecisions`. The server fills profile defaults and rejects unknown fields or values.

~~~json
{
  "workspaceSettings": { "collaborationHost": "github" },
  "guideDecisions": {
  "agents": { "profile": "contextual", "routing": "...", "verification": "...", "codingStyle": "...", "functionDesign": "...", "commentStyle": "..." },
  "architecture": { "profile": "decision-focused", "boundaries": "...", "decisionTrigger": "..." },
  "team": { "profile": "small-team", "ownership": "...", "handoff": "..." },
  "plans": { "profile": "significant-change", "trigger": "...", "detail": "..." },
  "codeReview": { "profile": "defect-focused", "priorities": "...", "evidence": "..." },
  "pullRequest": { "profile": "standard", "issueLinks": "...", "checklist": "..." }
  }
}
~~~

Omit an inapplicable guide. `pullRequest` is allowed only for `collaborationHost: "github"`. Map an Other response to `profile: "custom"` and retain the explanation in `comment`. Do not record secrets, personal details, identities, or credentials.

## 0. Collaboration host

Ask before any guide question: **Which collaboration host should this bootstrap configure?**

- **No hosted PR workflow (Recommended)** — create no provider-specific PR template or server-side policy instructions.
- **GitHub** — allow the GitHub pull-request template question; explain that branch protection, rulesets, and required approvals remain manual repository-host settings.
- **GitLab or existing/other host** — create no GitHub-specific files; preserve existing host conventions.

Record `none`, `github`, `gitlab`, `existing`, or `other` exactly as the MCP schema permits. A selected `delivery.github-actions` catalogue option may plan CI, but does not by itself select a PR template.

## 1. AGENTS.md

Before asking for the policy, show the `agentGuideEvidence` from the latest `inspect_workspace` response: detected source/test/documentation roots, declared verification-script names, lockfiles, generated-file hints, and existing root or nested guides. This is local metadata only; do not read or reproduce source contents or package-script bodies. Ask the user to correct a missing or misleading path before the file plan. If no declared verification command is found, record that it must remain a confirmation prompt in the generated guide rather than inventing a command.

Ask: **How should Codex route repository guidance?**

- **Contextual routing (Recommended)** — Read only the linked guide relevant to the task; use a plan for cross-cutting work and verify affected behavior.
- **Minimal routing** — Keep only essential repository boundaries and commands; use linked guides only when explicitly requested.
- **Strict governance** — Require the relevant guide and written plan for structural, dependency, or contract changes.

Only for Other/custom or strict governance, ask the next missing routing detail:

- **Verification baseline:** affected checks, full suite before merge, or a project-specific command/comment.
- **Local scope:** root guide only, or nested guidance only where a directory has genuinely different rules. Never create nested AGENTS.md files merely to repeat root guidance.

When the policy is `nested-where-needed`, list only inventory-detected candidate areas and ask for the distinct local rule before planning any nested guide. Do not create a nested file solely because a conventional directory exists.

Then ask each coding-convention decision separately. These are working conventions, not a request to prescribe formatter settings or duplicate the linter.

Ask: **Which coding baseline should Codex preserve?**

- **Existing patterns (Recommended)** — follow the closest detected project pattern; for a new project, use the selected language and framework's idiomatic convention.
- **Modular boundaries** — keep module contracts narrow; separate domain decisions from framework, transport, and storage adapters.
- **Functional core** — keep domain calculations deterministic and immutable where practical; isolate I/O and mutation at explicit boundaries.

Ask: **How should functions be divided?**

- **Clear responsibility (Recommended)** — one clear responsibility and abstraction level; split mixed calculation, I/O, state-change, or rendering concerns only when the contract becomes clearer.
- **Separate side effects** — additionally require database, network, filesystem, process, and UI-state effects to remain behind focused boundaries.
- **Other** — describe the project's rule and the trade-off it protects.

Ask: **What belongs in code comments?**

- **Why and invariants (Recommended)** — record rationale, constraints, compatibility notes, and non-obvious invariants; do not restate mechanics.
- **Minimal comments** — prefer self-explanatory names and small interfaces; retain comments only for context that code cannot express.
- **Other** — describe the project's comment convention.

For every Other/custom answer, collect one concise policy that names the affected scope, the convention or invariant, and the safe alternative. Do not treat a formatter, linter, test command, or an unconfirmed incident as a prose rule. Keep mechanical checks in the declared tooling or CI. Do not ask the user to provide generic coding-style boilerplate when the local repository already supplies a clear pattern.

## 2. ARCHITECTURE.md

Ask: **How strongly should architecture decisions be governed?**

- **Decision-focused (Recommended)** — Preserve declared boundaries; record only cross-cutting, public-contract, dependency, data-flow, or deployment decisions.
- **Lightweight** — Document major boundaries and revisit details only when the codebase grows.
- **Controlled** — Require explicit boundary, data-classification, ownership, and operational considerations for significant changes.

Only for Other/custom or a profile that needs more detail, ask:

- **Primary boundary shape:** feature/module, layer, service, package, mobile feature, or comment.
- **Decision trigger:** public contracts only, any cross-cutting change, or a custom threshold.

Use the selected project profile and detected stack as evidence; do not ask the user to redescribe it.

## 3. TEAM_GUIDE.md

Ask: **Which collaboration model should the team guide support?**

- **Small-team / evolving ownership (Recommended)** — No invented owners; define lightweight handoffs and add ownership only when the team supplies it.
- **Shared ownership** — Require a reviewer or maintainer acknowledgement for cross-area changes.
- **Formal ownership** — Record team-owned areas, escalation, handoff acceptance, and release communication rules supplied by the user.

Only for Other/custom or a profile requiring more detail, ask:

- **Handoff expectation:** change summary only, summary plus test evidence, or custom.
- **Ownership source:** CODEOWNERS, this guide, external tracker reference, or custom. Never request or invent individual names.

## 4. PLANS.md

Ask: **When should a durable written execution plan be required?**

- **Significant changes (Recommended)** — For multi-step, risky, cross-cutting, hard-to-reverse, interface, security, data, deployment, or dependency changes.
- **Broad planning** — For every non-trivial implementation change.
- **Milestone planning** — Only for work spanning a milestone, release, or multiple services.

Only for Other/custom or a profile requiring more detail, ask:

- **Required detail:** concise scope and tests, full implementation/rollback plan, or custom.
- **Plan lifecycle:** update while implementing, review before execution, or custom.

Keep plans in docs/plans/ unless the user supplies an existing project convention.

## 5. CODE_REVIEW.md

Ask: **What should code review prioritize beyond correctness?**

- **Defect-focused (Recommended)** — Scope, public contracts, error handling, tests, and actionable findings.
- **Security-focused** — Add authentication, authorization, secrets, privacy, input handling, and dependency-risk checks.
- **Release-critical** — Add migration, observability, configuration, compatibility, rollout, and rollback checks.

Only for Other/custom or a profile requiring more detail, ask:

- **Finding threshold:** blocking defects only, defects plus follow-ups, or custom.
- **Evidence required:** affected automated tests, tests plus manual checks, or custom.

Keep mechanical formatting checks in automated tooling rather than expanding review instructions.

## 6. .github/pull_request_template.md (GitHub only)

Ask: **How detailed should pull-request metadata be?**

- **Standard (Recommended)** — Summary, scope/architecture, validation evidence, and review/rollout notes.
- **Minimal** — Summary and validation evidence only.
- **Change-controlled** — Add issue/change reference, risk, migration, security, rollout, rollback, and owner acknowledgement fields.

Only for Other or a profile requiring more detail, ask:

- **Reference policy:** optional issue links, required ticket/change link, or custom.
- **Release checklist:** no additional checklist, migration/configuration checks, or custom.

Ask this section only when `collaborationHost` is `github`. Do not create a GitHub-specific template otherwise. Its answers remain project conventions; branch protection and required approvals remain repository-host settings.
