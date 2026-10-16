# Evidence-based AGENTS.md authoring

Use this reference when collecting the `AGENTS.md` decision. It records durable design principles; it does not trigger a network request and it is not a template to copy verbatim.

## Sources reviewed for this plugin

- [OpenAI Codex Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide) — Codex merges instructions from repository root to the current directory, so deeper instructions should only add genuinely local rules.
- [OpenAI Custom Code Review rules for Codex](https://developers.openai.com/blog/custom-code-review-rules-for-codex) — durable review rules identify a consequential invariant, scope it to the relevant code, and name the safe path; mechanical checks belong in CI.
- [OpenAI Agents Python AGENTS.md](https://github.com/openai/openai-agents-python/blob/main/AGENTS.md) — a root guide can provide repository structure, command conventions, generated-document boundaries, and links to detailed contributor material.
- [Sentry AGENTS.md](https://github.com/getsentry/sentry/blob/master/AGENTS.md) — root-wide execution rules belong at the root; frontend, backend, and test-specific details can live in targeted local guides.

These sources are examples of structure, not policy authority. Never copy organization-specific command text, contributor identity, URLs, release instructions, or security policy into another project.

## Rules adopted by Project Bootstrap

1. Keep the main document shape separate from evidence-backed facets. A multi-service AI repository can need service, cross-package, data and AI guidance together. A data profile alone is not evidence of model use; `next-env.d.ts` alone is not a distribution architecture.
2. Build source, test, evaluation, platform, data and manifest maps from local inventory evidence. Retain excluded output-directory boundaries without traversing caches. Treat Rust, Swift, plain Dart and Terraform as detected but unsupported for automatic command generation.
3. Evaluate verification coverage per manifest area. A web lint command does not verify a Python service. Distinguish declared checks, test evidence, user-confirmed checks, configuration-only roots and missing/unsupported checks. Declaration is never an execution result.
4. Resolve Node package managers from the nearest explicit manifest setting or local lockfile, then applicable ancestors. Preserve explicit choices and disclose conflicting/ambiguous lockfiles. Require nonempty string script values. Do not expose script bodies or assume that a test/build/lint name implies harmless execution.
5. Record effects and review requirements for every command. Persistent watchers, fixers, publication, device and live-system checks are not default verification. Network, setup and runtime execution still require the existing command approval boundary.
6. Standard check adapters are bounded:
   - Flutter: require a recognised dependency mapping with `dependencies.flutter.sdk: flutter`. Keep ordinary Dart packages separate.
   - Python: require pytest/ruff/mypy configuration evidence before emitting the corresponding module check. Do not select an environment manager or install missing tools.
   - Go: require a module declaration; surface potential dependency network effects.
   - Maven/Gradle: use the wrapper available for the host OS. Infer a Gradle test task only for a recognised JVM plugin; Android variants and device tasks need declared or user-confirmed commands.
   - .NET: retain project scope, use `--no-restore`, and require test-project evidence for test commands.
   - Make/CI: use only declared check targets or bounded literal check invocations. Dynamic commands, compound shell expressions and ambiguous CI working directories remain confirmation items.
7. When evidence is insufficient, retain a visible gap. User-confirmed checks may be recorded as structured `reviewedCommands` with exact directory, coverage, stage and effects. Their declaration does not grant execution approval.
8. Honour routing, verification, coding, comment, local-scope and locale decisions in the actual output. A full-suite policy must not retain a conflicting affected-check-only completion rule. User-defined invariants use `rules` with scope, invariant and safeAlternative; purpose/context uses `projectContext`.
9. Treat generated filenames and output directories as hints, not ownership proof. Record a confirmed source-to-output relationship before prohibiting edits or prescribing a generator.
10. Preserve existing instructions. In one directory, a nonempty `AGENTS.override.md` precedes `AGENTS.md`; deeper instructions take precedence where they conflict. A new root guide potentially shadowed by an override requires a merge preview. See the [official instruction discovery rules](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
11. Keep the root under its 16 KiB generation budget. Bound path/command lists and route large repositories to the planned `docs/project-bootstrap/agents-evidence.md` index, which retains every collected command, area and gap. Omitted root entries are not optional checks. Do not create nested AGENTS files merely to distribute repeated rules.
12. Refresh instructions when commands, areas or contracts change, remove obsolete rules, and distinguish executed checks from declared or unavailable checks.

## Rendering boundary

Use `create_plan.agentsGuide.markdown` exactly as the `{{AGENTS_DOCUMENT}}` value. The server renders conditional sections, coding policy and Korean/English prose deterministically; command strings and paths remain unchanged. Individual `templateValues` remain available for evidence inspection, not for reconstructing a competing root document.

When `agentsGuide.supportingDocuments` is nonempty, its documents appear as planned artifacts with exact content. Apply the same conflict and approval rules to them. Do not create an unplanned index or a broken reference to skipped/conflicting content. A document-budget or evidence-collection gap remains visible and prevents claiming that the guide is complete.
