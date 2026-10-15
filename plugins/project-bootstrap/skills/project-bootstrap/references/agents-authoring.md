# Evidence-based AGENTS.md authoring

Use this reference when collecting the `AGENTS.md` decision. It records durable design principles; it does not trigger a network request and it is not a template to copy verbatim.

## Sources reviewed for this plugin

- [OpenAI Codex Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide) — Codex merges instructions from repository root to the current directory, so deeper instructions should only add genuinely local rules.
- [OpenAI Custom Code Review rules for Codex](https://developers.openai.com/blog/custom-code-review-rules-for-codex) — durable review rules identify a consequential invariant, scope it to the relevant code, and name the safe path; mechanical checks belong in CI.
- [OpenAI Agents Python AGENTS.md](https://github.com/openai/openai-agents-python/blob/main/AGENTS.md) — a root guide can provide repository structure, command conventions, generated-document boundaries, and links to detailed contributor material.
- [Sentry AGENTS.md](https://github.com/getsentry/sentry/blob/master/AGENTS.md) — root-wide execution rules belong at the root; frontend, backend, and test-specific details can live in targeted local guides.

These sources are examples of structure, not policy authority. Never copy organization-specific command text, contributor identity, URLs, release instructions, or security policy into another project.

## Rules adopted by Project Bootstrap

1. Keep the root guide concise and task-routed. Link to `ARCHITECTURE.md`, `PLANS.md`, and review guidance only when their subject is relevant.
2. Treat coding conventions as project decisions, not language stereotypes. Prefer a detected local pattern; for a new project, let the user select a concise boundary and function-design baseline.
3. A review rule must preserve a confirmed, consequential, non-obvious invariant. State its scope and safe path. Keep formatting, linting, and other mechanical checks in declared tooling or CI.
4. Build the repository map from local inventory evidence. Describe only paths that were detected or explicitly confirmed by the user.
5. List a verification command only when its name is declared in a local manifest. Preserve the manifest-relative working directory and do not include arbitrary script bodies.
6. Treat lockfiles and generated-file hints as review boundaries, not proof of ownership. Ask for the owning generator before adding a prohibition or a nested guide.
7. Add a nested `AGENTS.md` only if that directory has a distinct, confirmed rule. Never duplicate the root guide in every source folder.
8. When evidence is missing, record a visible confirmation prompt rather than guessing. The user must review the resulting blueprint before file-plan approval.

## Rendering boundary

The `create_plan` response contains `agentsGuide.templateValues`, produced from local inventory evidence and the approved guide policy. Render those values exactly into the six AGENTS placeholders. The surrounding guidance may be localized, but do not alter paths, commands, coding decisions, or evidence classifications without a new reviewed inventory or user confirmation.
