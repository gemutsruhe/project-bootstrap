import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  checkUpdates,
  createAgentsGuideBlueprint,
  createAgentGuideEvidence,
  createCatalogExplorer,
  createPlan,
  createWorkspaceGuideConfigurator,
  determineProgrammingLanguageDecision,
  determineResponseLocaleDecision,
  inspectCodexSettings,
  inspectWorkspace,
  listGuidePolicies,
  listCatalog,
  loadCatalog,
  parseFrontmatter,
  recommend,
  submitCatalogSelection,
  submitWorkspaceGuideConfiguration,
  validateSelection
} from "../src/core.js";

const catalog = await loadCatalog();

test("workspace guide configurator exposes one guide's editable policy and validates submitted additions", () => {
  const rendered = createWorkspaceGuideConfigurator({
    guideKey: "agents",
    locale: "ko",
    decision: {
      profile: "contextual",
      codingStyle: "functional-core",
      reviewedCommands: [{
        command: "npm run test",
        workingDirectory: ".",
        kind: "test",
        stage: "verification",
        effects: ["unknown"],
        confirmed: true
      }]
    }
  });
  assert.equal(rendered.guide.key, "agents");
  assert.equal(rendered.draft.codingStyle, "functional-core");
  assert.equal(rendered.workspaceSettings.collaborationHost, "none");
  assert.ok(rendered.guide.structuredFields.rules);
  assert.equal(rendered.draft.reviewedCommands[0].command, "npm run test");

  const submitted = submitWorkspaceGuideConfiguration({
    guideKey: "agents",
    locale: "ko",
    decision: {
      profile: "contextual",
      codingStyle: "functional-core",
      rules: [{
        scope: "server/src",
        invariant: "Guide settings must remain schema-validated.",
        safeAlternative: "Add an allowed policy field and a regression test before rendering it."
      }]
    }
  });
  assert.equal(submitted.status, "accepted");
  assert.equal(submitted.guideDecisions.agents.rules[0].scope, "server/src");
  assert.equal(submitted.continuation.replaceOnlyCurrentGuideDecision, true);
  assert.throws(
    () => submitWorkspaceGuideConfiguration({ guideKey: "agents", decision: { profile: "custom" } }),
    /comment is required/
  );
  assert.throws(
    () => createWorkspaceGuideConfigurator({ guideKey: "pullRequest" }),
    /collaborationHost: github/
  );
});

test("parses flat YAML frontmatter with locale fields and lists", () => {
  const parsed = parseFrontmatter("---\nid: sample\ntags: [one, two]\ntitle_en: Sample\n---\nBody\n");
  assert.equal(parsed.attributes.id, "sample");
  assert.deepEqual(parsed.attributes.tags, ["one", "two"]);
  assert.equal(parsed.body, "Body\n");
});

test("catalogue has the seven required profiles and Korean fallback data", () => {
  const profiles = listCatalog(catalog, { kind: "profile", locale: "ko" });
  assert.equal(profiles.length, 7);
  assert.ok(profiles.some((profile) => profile.id === "profile.web-fullstack" && /웹/.test(profile.label)));
  assert.ok(profiles.some((profile) => profile.id === "profile.android-native" && /Android/.test(profile.label)));
  assert.ok(profiles.some((profile) => profile.id === "profile.interactive-mockup" && /목업/.test(profile.label)));
  assert.ok(profiles.every((profile) => profile.path.endsWith(".md")));
  assert.ok(catalog.length >= 30);
});

test("catalog explorer includes localized candidate metadata and the packaged Markdown source", () => {
  const explorer = createCatalogExplorer(catalog, {
    candidateIds: ["profile.web-fullstack", "profile.api-service"],
    locale: "ko",
    title: "시작 프로필 비교"
  });
  assert.equal(explorer.title, "시작 프로필 비교");
  assert.equal(explorer.entries.length, 2);
  assert.match(explorer.entries[0].label, /웹/);
  assert.match(explorer.entries[0].markdown, /^---\n/);
  assert.match(explorer.entries[0].markdown, /title_ko:/);
});

test("catalog explorer selection becomes validated planning input for the selected decision", () => {
  const selection = submitCatalogSelection(catalog, {
    candidateIds: ["profile.web-fullstack", "profile.mobile-app"],
    selectedId: "profile.mobile-app",
    comment: "Mobile-first launch",
    locale: "ko"
  });
  assert.equal(selection.status, "accepted");
  assert.equal(selection.selection.id, "profile.mobile-app");
  assert.equal(selection.selection.kind, "profile");
  assert.equal(selection.selection.comment, "Mobile-first launch");
  assert.equal(selection.continuation.replaceOnlyCurrentDecision, true);
  assert.ok(selection.selection.suggestedIds.includes("language.typescript"));
  assert.throws(
    () => submitCatalogSelection(catalog, { candidateIds: ["profile.web-fullstack"], selectedId: "profile.mobile-app" }),
    /one of the candidateIds/
  );
});

test("technology comparisons offer a structured custom choice without accepting it as a catalogue ID", () => {
  const explorer = createCatalogExplorer(catalog, {
    candidateIds: ["data.postgresql", "data.sqlite", "data.mysql"], allowCustom: true, locale: "ko"
  });
  assert.deepEqual(explorer.entries.map((entry) => entry.id), ["data.postgresql", "data.sqlite", "data.mysql", "custom"]);
  assert.match(explorer.entries[3].summary, /자동 생성되지/);
  const selected = submitCatalogSelection(catalog, {
    candidateIds: explorer.entries.map((entry) => entry.id), selectedId: "custom",
    comment: "MariaDB for the existing API database", locale: "ko"
  });
  assert.equal(selected.selection.custom, true);
  assert.equal(selected.selection.kind, "data");
  assert.match(selected.continuation.message, /customChoices/);
  assert.throws(() => submitCatalogSelection(catalog, {
    candidateIds: explorer.entries.map((entry) => entry.id), selectedId: "custom", comment: ""
  }), /requires the technology name/);
  assert.throws(() => createCatalogExplorer(catalog, {
    candidateIds: ["profile.web-fullstack"], allowCustom: true
  }), /non-profile/);
});

test("Android architecture and state implementation are independent reviewed choices", () => {
  const recommendations = recommend(catalog, { requirements: { productType: "android" } });
  assert.equal(recommendations[0].id, "profile.android-native");
  assert.deepEqual(recommendations[0].template.ids, [
    "architecture.modular-monolith", "language.kotlin", "mobile.android-native", "android.ui.mvvm", "android.state.jetpack"
  ]);

  const patterns = createCatalogExplorer(catalog, {
    candidateIds: ["android.ui.mvvm", "android.ui.mvi"], allowCustom: true, locale: "ko"
  });
  assert.match(patterns.entries[2].label, /아키텍처/);
  const libraries = createCatalogExplorer(catalog, {
    candidateIds: ["android.state.jetpack", "android.state.mavericks", "android.state.orbit"], allowCustom: true, locale: "ko"
  });
  assert.match(libraries.entries[3].label, /상태관리/);

  const baseline = ["language.kotlin", "mobile.android-native", "android.ui.mvvm", "android.state.jetpack"];
  assert.equal(validateSelection(catalog, { selectedIds: baseline }).status, "pass");
  assert.equal(validateSelection(catalog, { selectedIds: ["language.kotlin", "mobile.android-native", "android.ui.mvi", "android.state.mavericks"] }).status, "pass");
  assert.equal(validateSelection(catalog, { selectedIds: ["language.kotlin", "mobile.android-native", "android.ui.mvvm", "android.state.mavericks"] }).status, "pass");
  assert.equal(validateSelection(catalog, { selectedIds: ["language.kotlin", "mobile.android-native", "android.ui.mvi", "android.state.orbit"] }).status, "pass");
  assert.equal(validateSelection(catalog, { selectedIds: ["language.kotlin", "mobile.android-native", "android.ui.mvvm", "android.state.orbit"] }).status, "block");
  assert.equal(validateSelection(catalog, { selectedIds: [...baseline, "android.ui.mvi"] }).status, "block");
  assert.equal(validateSelection(catalog, { selectedIds: [...baseline, "mobile.expo"] }).status, "block");
  assert.equal(validateSelection(catalog, { selectedIds: ["android.state.mavericks"] }).status, "block");
  assert.ok(validateSelection(catalog, { selectedIds: ["language.kotlin", "mobile.android-native"] }).messages
    .some((message) => message.code === "android-ui-architecture-undecided"));

  const plan = createPlan(catalog, { selectedIds: baseline, inventory: { files: [] } });
  assert.equal(plan.status, "ready-with-warnings");
  assert.ok(plan.scaffolds.some((scaffold) => scaffold.runtime === "android-native" && scaffold.operation === "manual-design-required"));
  assert.match(plan.artifacts.find((artifact) => artifact.path === "docs/architecture/android-ui.md").content, /android.ui.mvvm/);
  assert.match(plan.artifacts.find((artifact) => artifact.path === "docs/architecture/android-ui.md").content, /android.state.jetpack/);
  assert.equal(plan.artifacts.some((artifact) => artifact.path === "build.gradle.kts"), false);
  assert.equal(plan.commands.some((command) => /gradle|mavericks/i.test(command.command)), false);
  const existing = createPlan(catalog, { selectedIds: baseline, inventory: { files: ["settings.gradle.kts", "app/build.gradle.kts", "app/src/main/AndroidManifest.xml"] } });
  assert.ok(existing.scaffolds.some((scaffold) => scaffold.operation === "not-needed"));
  const genericGradle = createPlan(catalog, { selectedIds: baseline, inventory: { files: ["settings.gradle.kts", "app/build.gradle.kts"] } });
  assert.ok(genericGradle.scaffolds.some((scaffold) => scaffold.operation === "manual-design-required"));
});

test("scoped custom Android architecture and library choices are documented without dependencies", () => {
  const customChoices = [
    { category: "architecture", name: "Redux-style UI", purpose: "Existing team pattern", scope: "android", replacesId: "android.ui.mvvm" },
    { category: "library", name: "Custom state store", purpose: "Shared internal implementation", scope: "android", replacesId: "android.state.jetpack" }
  ];
  const selectedIds = ["language.kotlin", "mobile.android-native"];
  const validation = validateSelection(catalog, { selectedIds, customChoices });
  assert.equal(validation.status, "warning");
  assert.equal(validation.messages.some((message) => message.code === "android-ui-architecture-undecided"), false);
  assert.equal(validation.messages.some((message) => message.code === "android-state-management-undecided"), false);
  const moduleScoped = validateSelection(catalog, { selectedIds, customChoices: [
    { ...customChoices[0], scope: "app/src/main" }, { ...customChoices[1], scope: "app/src/main" }
  ] });
  assert.equal(moduleScoped.messages.some((message) => message.code === "android-ui-architecture-undecided"), false);
  const plan = createPlan(catalog, { selectedIds, customChoices, inventory: { files: [] } });
  assert.match(plan.artifacts.find((artifact) => artifact.template === "custom-choice-record").content, /Redux-style UI/);
  assert.match(plan.artifacts.find((artifact) => artifact.template === "android-ui-decision").content, /Redux-style UI/);
  assert.equal(plan.artifacts.some((artifact) => artifact.path === "build.gradle.kts"), false);
  assert.throws(() => validateSelection(catalog, { selectedIds, customChoices: [
    { category: "architecture", name: "Redux-style UI", purpose: "Team pattern" }
  ] }), /require a scope/);
  assert.equal(validateSelection(catalog, { selectedIds: [...selectedIds, "android.ui.mvvm"], customChoices: [customChoices[0]] }).status, "block");
});

test("common templates are lean, catalogue-valid starting sets with database alternatives", () => {
  const recommendations = recommend(catalog, { requirements: { productType: "web" } });
  for (const profile of recommendations) {
    assert.equal(profile.template.policy, "common-starting-point");
    assert.deepEqual(profile.template.ids, profile.suggestedIds);
    assert.notEqual(validateSelection(catalog, { selectedIds: [profile.id, ...profile.template.ids] }).status, "block", profile.id);
    assert.equal(profile.template.ids.some((id) => id.startsWith("delivery.") || id === "messaging.nats"), false, profile.id);
  }
  assert.ok(listCatalog(catalog, { kind: "data" }).some((entry) => entry.id === "data.sqlite"));
  assert.ok(listCatalog(catalog, { kind: "data" }).some((entry) => entry.id === "data.mysql"));
});

test("custom language, database, and tool decisions are reviewed and recorded without invented adapters", () => {
  const customChoices = [
    { category: "language", name: "Ruby", purpose: "Existing team expertise", scope: "services/api", replacesId: "language.python" },
    { category: "database", name: "MariaDB", purpose: "Use the existing operational database", scope: "services/api", replacesId: "data.postgresql" },
    { category: "tool", name: "Buildkite", purpose: "Use the existing CI host", scope: "repository" }
  ];
  const selectedIds = ["profile.api-service"];
  const validation = validateSelection(catalog, { selectedIds, customChoices });
  assert.equal(validation.status, "warning");
  assert.equal(validation.customChoices.length, 3);
  const plan = createPlan(catalog, { selectedIds, customChoices, inventory: { files: [] } });
  const record = plan.artifacts.find((artifact) => artifact.template === "custom-choice-record");
  assert.equal(record.operation, "create");
  assert.match(record.content, /MariaDB/);
  assert.deepEqual(plan.customChoices, customChoices);
  assert.equal(plan.artifacts.some((artifact) => artifact.path === "pyproject.toml"), false);
  assert.equal(plan.artifacts.some((artifact) => artifact.path === ".github/workflows/ci.yml"), false);
  assert.equal(validateSelection(catalog, { selectedIds: ["data.postgresql"], customChoices: [customChoices[1]] }).status, "block");
  assert.throws(() => validateSelection(catalog, { selectedIds, customChoices: [{ category: "database", name: "", purpose: "test" }] }), /Invalid custom choice name/);
  assert.throws(() => validateSelection(catalog, { selectedIds, customChoices: [customChoices[0], customChoices[0]] }), /Duplicate custom choice/);
  const multipleDatabases = validateSelection(catalog, { selectedIds: ["data.postgresql", "data.mysql"] });
  assert.ok(multipleDatabases.messages.some((message) => message.code === "multiple-primary-databases"));
  const ambiguous = validateSelection(catalog, { selectedIds: ["data.postgresql"], customChoices: [
    { category: "database", name: "MariaDB", purpose: "Possible alternative" }
  ] });
  assert.ok(ambiguous.messages.some((message) => message.code === "custom-overlap-review" && message.status === "block"));
  const existingRuntime = validateSelection(catalog, {
    selectedIds: ["profile.api-service"], customChoices: [customChoices[0]], inventory: { state: "existing", languages: ["python"] }
  });
  assert.ok(existingRuntime.messages.some((message) => message.code === "custom-existing-runtime-review"));
});

test("each supported starting profile produces a non-writing review plan", () => {
  const profileIds = [
    "profile.web-fullstack",
    "profile.api-service",
    "profile.mobile-app",
    "profile.android-native",
    "profile.data-ai",
    "profile.multi-service-platform",
    "profile.interactive-mockup"
  ];
  for (const id of profileIds) {
    const plan = createPlan(catalog, { selectedIds: [id], inventory: { files: [] } });
    assert.notEqual(plan.status, "blocked", id);
    assert.ok(plan.artifacts.every((artifact) => artifact.approvalRequired), id);
    assert.equal(plan.commands[0].approvalRequired, true, id);
  }
});

test("plans include the complete Codex workspace guide bundle", () => {
  const plan = createPlan(catalog, {
    selectedIds: ["profile.web-fullstack"],
    inventory: { files: [] }
  });
  const templates = new Map(plan.artifacts.map((artifact) => [artifact.path, artifact.template]));

  assert.deepEqual(
    ["AGENTS.md", "ARCHITECTURE.md", "TEAM_GUIDE.md", "PLANS.md", "CODE_REVIEW.md"].map((path) => [path, templates.get(path)]),
    [
      ["AGENTS.md", "codex-instructions"],
      ["ARCHITECTURE.md", "architecture-guide"],
      ["TEAM_GUIDE.md", "team-guide"],
      ["PLANS.md", "planning-guide"],
      ["CODE_REVIEW.md", "code-review-guide"]
    ]
  );
  assert.equal(templates.has(".github/pull_request_template.md"), false);
  assert.equal(templates.has(".codex/config.toml"), false);
  assert.equal(templates.has("docker-compose.yml"), false);
  assert.equal(templates.has(".github/workflows/ci.yml"), false);
});

test("guide policy catalogue has localized, versioned defaults", () => {
  const policies = listGuidePolicies({ locale: "ko" });
  const agents = policies.find((guide) => guide.key === "agents");
  assert.equal(agents.profiles[0].id, "contextual");
  assert.match(agents.profiles[0].label, /상황별/);
  assert.equal(agents.profiles[0].defaults.localScope, "root-only");
  assert.equal(agents.profiles[0].defaults.documentStructure, "auto");
  assert.equal(agents.profiles[0].defaults.codingStyle, "existing-patterns");
  assert.ok(agents.fields.documentStructure.includes("sdk-ai"));
  assert.ok(agents.fields.functionDesign.includes("separate-effects"));
});

test("plans normalize reviewed workspace-guide decisions against the policy catalogue", () => {
  const plan = createPlan(catalog, {
    selectedIds: ["profile.web-fullstack"],
    inventory: { files: [] },
    workspaceSettings: { collaborationHost: "github" },
    guideDecisions: {
      agents: { profile: "strict-governance", verification: "affected-checks" },
      plans: { profile: "significant-change", detail: "scope-and-tests" },
      pullRequest: { profile: "standard", issueLinks: "optional" }
    }
  });

  assert.deepEqual(plan.guideDecisions, {
    agents: { profile: "strict-governance", routing: "relevant-guide-and-plan", verification: "affected-checks", localScope: "root-only", documentStructure: "auto", codingStyle: "modular-boundaries", functionDesign: "separate-effects", commentStyle: "why-and-invariants" },
    plans: { profile: "significant-change", trigger: "significant-change", detail: "scope-and-tests", lifecycle: "update-while-implementing" },
    pullRequest: { profile: "standard", issueLinks: "optional", checklist: "none" }
  });
  assert.equal(plan.guidePolicySchemaVersion, 4);
  assert.equal(plan.artifacts.find((artifact) => artifact.path === ".github/pull_request_template.md").operation, "create");
});

test("guide policies reject unknown values and GitHub-only decisions without a GitHub host", () => {
  assert.throws(
    () => createPlan(catalog, { selectedIds: ["profile.web-fullstack"], guideDecisions: { agents: { profile: "not-a-policy" } } }),
    /Invalid agents\.profile/
  );
  assert.throws(
    () => createPlan(catalog, { selectedIds: ["profile.web-fullstack"], guideDecisions: { pullRequest: { profile: "standard" } } }),
    /require collaborationHost: github/
  );
  assert.throws(
    () => createPlan(catalog, { selectedIds: ["profile.web-fullstack"], guideDecisions: { agents: { profile: "custom" } } }),
    /comment is required/
  );
  assert.throws(
    () => createPlan(catalog, { selectedIds: ["profile.web-fullstack"], guideDecisions: { agents: { profile: "contextual", codingStyle: "custom" } } }),
    /comment is required/
  );
});

test("delivery and GitHub artifacts require explicit matching decisions", () => {
  const plan = createPlan(catalog, {
    selectedIds: ["delivery.docker-compose", "delivery.github-actions"],
    inventory: { files: [] },
    workspaceSettings: { collaborationHost: "github" },
    guideDecisions: { pullRequest: { profile: "minimal" } }
  });
  const paths = plan.artifacts.map((artifact) => artifact.path);
  assert.ok(paths.includes("docker-compose.yml"));
  assert.ok(paths.includes(".github/workflows/ci.yml"));
  assert.ok(paths.includes(".github/pull_request_template.md"));
  assert.equal(plan.artifacts.find((artifact) => artifact.path === "docker-compose.yml").operation, "deferred");
  assert.equal(plan.artifacts.find((artifact) => artifact.path === ".github/workflows/ci.yml").operation, "deferred");
});

test("CI is activated only from declared root npm checks and a lockfile", () => {
  const files = ["package.json", "package-lock.json", "src/app/page.tsx"];
  const agentGuideEvidence = createAgentGuideEvidence(files, {
    manifests: [{ path: "package.json", content: JSON.stringify({
      scripts: { test: "vitest run", lint: "eslint .", build: "next build" },
      dependencies: { next: "16.0.0" }
    }) }]
  });
  const plan = createPlan(catalog, {
    selectedIds: ["delivery.github-actions"],
    inventory: { files, agentGuideEvidence },
    workspaceSettings: { nodeVersion: "24" }
  });
  const workflow = plan.artifacts.find((artifact) => artifact.path === ".github/workflows/ci.yml");
  assert.equal(workflow.operation, "create");
  assert.match(workflow.content, /npm ci/);
  assert.match(workflow.content, /npm run test/);
  assert.match(workflow.content, /npm run build/);
  assert.match(workflow.content, /node-version: 24/);
  assert.doesNotMatch(workflow.content, /Validate bootstrap records/);
});

test("CI stays deferred without a reviewed Node.js version", () => {
  const files = ["package.json", "package-lock.json"];
  const agentGuideEvidence = createAgentGuideEvidence(files, {
    manifests: [{ path: "package.json", content: JSON.stringify({ scripts: { test: "vitest run", build: "next build" } }) }]
  });
  const plan = createPlan(catalog, { selectedIds: ["delivery.github-actions"], inventory: { files, agentGuideEvidence } });
  assert.equal(plan.artifacts.find((artifact) => artifact.path === ".github/workflows/ci.yml").operation, "deferred");
});

test("Compose remains deferred until its local runtime assumptions are reviewed", () => {
  const files = ["Dockerfile", ".env.example"];
  const pending = createPlan(catalog, {
    selectedIds: ["delivery.docker-compose"],
    inventory: { files }
  });
  assert.equal(pending.artifacts.find((artifact) => artifact.path === "docker-compose.yml").operation, "deferred");
  const ready = createPlan(catalog, {
    selectedIds: ["delivery.docker-compose"],
    inventory: { files },
    workspaceSettings: { containerPort: 3000 }
  });
  const compose = ready.artifacts.find((artifact) => artifact.path === "docker-compose.yml");
  assert.equal(compose.operation, "create");
  assert.match(compose.content, /3000:3000/);
  assert.doesNotMatch(compose.content, /env_file:/);
  const database = createPlan(catalog, {
    selectedIds: ["delivery.docker-compose", "data.postgresql"],
    inventory: { files },
    workspaceSettings: { containerPort: 3000 }
  });
  assert.equal(database.artifacts.find((artifact) => artifact.path === "docker-compose.yml").operation, "deferred");
  const customDatabase = createPlan(catalog, {
    selectedIds: ["delivery.docker-compose"],
    customChoices: [{ category: "database", name: "MariaDB", purpose: "Existing service", scope: "api" }],
    inventory: { files }, workspaceSettings: { containerPort: 3000 }
  });
  assert.equal(customDatabase.artifacts.find((artifact) => artifact.path === "docker-compose.yml").operation, "deferred");
});

test("alternate GitHub pull-request templates require a non-writing merge preview", () => {
  const plan = createPlan(catalog, {
    selectedIds: ["profile.web-fullstack"],
    inventory: { files: ["docs/pull_request_template.md"] },
    workspaceSettings: { collaborationHost: "github" },
    guideDecisions: { pullRequest: { profile: "standard" } }
  });
  const pullRequest = plan.artifacts.find((artifact) => artifact.path === ".github/pull_request_template.md");
  assert.equal(plan.status, "ready-with-warnings");
  assert.equal(pullRequest.operation, "merge-preview");
  assert.deepEqual(pullRequest.relatedPaths, ["docs/pull_request_template.md"]);
});

test("a truncated inventory blocks all file planning", () => {
  const plan = createPlan(catalog, {
    selectedIds: ["profile.web-fullstack"],
    inventory: { files: ["README.md"], truncated: true }
  });
  assert.equal(plan.status, "blocked");
  assert.equal(plan.artifacts.length, 0);
  assert.ok(plan.validation.messages.some((message) => message.code === "incomplete-workspace-inventory"));
});

test("recommendation remains explainable and preserves explicit preference", () => {
  const results = recommend(catalog, {
    requirements: { productType: "web", targetStage: "mvp", teamSize: 2, operationsPreference: "low", preferredIds: ["profile.web-fullstack"] },
    inventory: { languages: ["typescript"] }
  });
  assert.equal(results[0].id, "profile.web-fullstack");
  assert.ok(results[0].reasons.some((reason) => reason.kind === "explicit-preference"));
  assert.ok(results[0].reasons.some((reason) => reason.kind === "target-stage"));
});

test("an interactive mockup target prioritizes the mockup profile for a web product", () => {
  const results = recommend(catalog, {
    requirements: { productType: "web", targetStage: "mockup" },
    inventory: { languages: ["typescript"] }
  });
  assert.equal(results[0].id, "profile.interactive-mockup");
  assert.ok(results[0].reasons.some((reason) => reason.kind === "target-stage"));
});

test("validation blocks missing requirements and incompatible pairs", () => {
  const missingRuntime = validateSelection(catalog, { selectedIds: ["frontend.nextjs"] });
  assert.equal(missingRuntime.status, "block");
  assert.ok(missingRuntime.messages.some((message) => message.code === "missing-requirement"));

  const missingMessaging = validateSelection(catalog, { selectedIds: ["architecture.event-driven"] });
  assert.equal(missingMessaging.status, "block");
  assert.ok(missingMessaging.messages.some((message) => message.relatedId === "messaging.nats"));
});

test("validation identifies operational warnings without blocking a valid selection", () => {
  const result = validateSelection(catalog, {
    selectedIds: ["architecture.microservices", "observability.opentelemetry"],
    requirements: { teamSize: 2 }
  });
  assert.equal(result.status, "warning");
  assert.ok(result.messages.some((message) => message.code === "small-team-microservices"));
});

test("all supported runtime adapters produce a reviewable plan", () => {
  const runtimes = [
    "language.typescript",
    "language.python",
    "language.java",
    "language.kotlin",
    "language.go",
    "language.dotnet",
    "language.flutter"
  ];
  for (const runtime of runtimes) {
    const plan = createPlan(catalog, { selectedIds: [runtime], inventory: { files: [] } });
    assert.notEqual(plan.status, "blocked", runtime);
    assert.ok(plan.artifacts.some((artifact) => artifact.template.includes("interface-contract") || artifact.template.includes("build-config") || artifact.template.includes("compiler-config") || artifact.template.includes("analysis-config")), runtime);
  }
});

test("a new Flutter selection plans the standard Flutter SDK scaffold separately from file writes", () => {
  const plan = createPlan(catalog, {
    selectedIds: ["language.flutter"],
    projectName: "My Starter App",
    inventory: { files: [] }
  });
  assert.equal(plan.status, "ready-with-warnings");
  assert.equal(plan.agentsGuide.status, "needs-confirmation");
  assert.equal(plan.scaffolds[0].runtime, "flutter");
  assert.equal(plan.scaffolds[0].operation, "generate");
  assert.equal(plan.commands[0].command, "flutter create --no-pub --project-name my_starter_app .");
  assert.ok(plan.commands[0].expectedPaths.includes("lib/main.dart"));
  assert.ok(plan.commands[0].expectedPaths.includes("android/"));
  assert.equal(plan.commands[0].approvalRequired, true);
  assert.equal(plan.artifacts.some((artifact) => artifact.path === "analysis_options.yaml"), false);
});

test("an existing Flutter scaffold is preserved without a flutter create command", () => {
  const files = ["pubspec.yaml", "lib/main.dart", "android/app/build.gradle.kts"];
  const plan = createPlan(catalog, {
    selectedIds: ["language.flutter"],
    projectName: "existing_app",
    inventory: { files, agentGuideEvidence: createAgentGuideEvidence(files, { pubspec: "dependencies:\n  flutter:\n    sdk: flutter\n" }) }
  });
  assert.equal(plan.scaffolds[0].operation, "not-needed");
  assert.equal(plan.commands[0].command, "No command is scheduled by default.");
});

test("a new Expo selection plans a root scaffold before bootstrap artifacts", () => {
  const plan = createPlan(catalog, {
    selectedIds: ["profile.mobile-app", "language.typescript", "mobile.expo"],
    projectName: "My Expo App",
    inventory: { files: [] }
  });
  const scaffold = plan.scaffolds.find((candidate) => candidate.runtime === "expo");

  assert.equal(plan.status, "ready-with-warnings");
  assert.equal(scaffold.operation, "generate");
  assert.equal(scaffold.scaffoldPath, ".");
  assert.equal(plan.commands[0].command, "npx create-expo-app@latest . --template default --no-agents-md --yes");
  assert.match(plan.commands[0].networkEffect, /Downloads/);
  assert.ok(plan.commands[0].expectedPaths.includes("src/app/_layout.tsx"));
  assert.equal(plan.runtimeSetup.artifactWritePhase, "post-runtime-scaffold");
  assert.equal(plan.runtimeSetup.reinspectionRequired, true);
  assert.equal(plan.artifacts.some((artifact) => artifact.path === "tsconfig.json"), false);
  assert.ok(plan.artifacts.every((artifact) => artifact.operation !== "create" || artifact.phase === "post-runtime-scaffold"));
});

test("a new Next.js monorepo requires an explicit path and plans the app before workspace files", () => {
  const selectedIds = ["language.typescript", "frontend.nextjs", "repository.monorepo"];
  const undecided = createPlan(catalog, { selectedIds, inventory: { files: [] } });
  assert.equal(undecided.status, "blocked");
  assert.equal(undecided.scaffolds[0].operation, "needs-layout-decision");
  assert.equal(undecided.artifacts.length, 0);
  assert.equal(undecided.commands.length, 0);

  const planned = createPlan(catalog, {
    selectedIds,
    inventory: { files: [] },
    workspaceSettings: { applicationPath: "apps/web" }
  });
  assert.equal(planned.scaffolds[0].operation, "generate");
  assert.match(planned.commands[0].command, /create-next-app@latest apps\/web/);
  assert.match(planned.commands[0].command, /--skip-install --disable-git/);
  assert.match(planned.commands[0].command, /--no-agents-md --no-agent-feedback/);
  assert.equal(planned.runtimeSetup.artifactWritePhase, "post-runtime-scaffold");
  assert.equal(planned.artifacts.find((artifact) => artifact.path === "package.json").phase, "post-runtime-scaffold");
  assert.equal(planned.artifacts.some((artifact) => artifact.path === "tsconfig.json"), false);
});

test("a custom package manager prevents an npm-only Next.js scaffold command", () => {
  const plan = createPlan(catalog, {
    selectedIds: ["language.typescript", "frontend.nextjs", "repository.monorepo"],
    customChoices: [{ category: "tool", name: "pnpm", purpose: "Team package-manager policy", scope: "repository" }],
    workspaceSettings: { applicationPath: "apps/web" },
    inventory: { files: [] }
  });
  assert.equal(plan.status, "blocked");
  assert.equal(plan.scaffolds[0].operation, "needs-tooling-decision");
  assert.equal(plan.artifacts.length, 0);
  assert.equal(plan.commands.length, 0);
});

test("an existing Next.js app is preserved and a missing monorepo root manifest is planned", () => {
  const selectedIds = ["language.typescript", "frontend.nextjs", "repository.monorepo"];
  const plan = createPlan(catalog, {
    selectedIds,
    inventory: { files: ["apps/web/package.json", "apps/web/next.config.ts", "apps/web/src/app/page.tsx"] },
    workspaceSettings: { applicationPath: "apps/web" }
  });
  assert.equal(plan.scaffolds[0].operation, "not-needed");
  assert.equal(plan.artifacts.find((artifact) => artifact.path === "package.json").operation, "create");
  assert.equal(plan.commands[0].command, "npm install");
  assert.equal(plan.artifacts.some((artifact) => artifact.path === "tsconfig.json"), false);
});

test("an existing Expo scaffold is preserved and its generated TypeScript configuration is not replaced", () => {
  const files = ["package.json", "app.json", "tsconfig.json", "src/app/_layout.tsx"];
  const plan = createPlan(catalog, {
    selectedIds: ["profile.mobile-app", "language.typescript", "mobile.expo"],
    inventory: { files, agentGuideEvidence: createAgentGuideEvidence(files, { packageJson: JSON.stringify({ dependencies: { expo: "*" }, scripts: { lint: "expo lint" } }) }) }
  });
  const scaffold = plan.scaffolds.find((candidate) => candidate.runtime === "expo");

  assert.equal(scaffold.operation, "not-needed");
  assert.equal(plan.commands[0].command, "No command is scheduled by default.");
  assert.equal(plan.artifacts.some((artifact) => artifact.path === "tsconfig.json"), false);
  assert.equal(plan.runtimeSetup.reinspectionRequired, false);
});

test("a populated workspace cannot silently become a nested Expo project", () => {
  const plan = createPlan(catalog, {
    selectedIds: ["profile.mobile-app", "language.typescript", "mobile.expo"],
    inventory: { files: ["AGENTS.md"] }
  });
  const scaffold = plan.scaffolds.find((candidate) => candidate.runtime === "expo");

  assert.equal(scaffold.operation, "requires-empty-workspace");
  assert.match(scaffold.reason, /(implicit apps|nested Git)/);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.artifacts.length, 0);
  assert.equal(plan.commands.length, 0);
});

test("mobile runtime alternatives cannot be selected together", () => {
  const result = validateSelection(catalog, {
    selectedIds: ["language.typescript", "language.flutter", "mobile.expo", "mobile.flutter"]
  });
  assert.equal(result.status, "block");
  assert.ok(result.messages.some((message) => message.code === "conflict"));
});

test("plans mark existing paths as conflicts and do not schedule commands", () => {
  const plan = createPlan(catalog, {
    selectedIds: ["language.typescript", "delivery.github-actions"],
    inventory: { files: ["AGENTS.md", ".github/workflows/ci.yml"] }
  });
  assert.equal(plan.status, "ready-with-warnings");
  assert.equal(plan.artifacts.find((artifact) => artifact.path === "AGENTS.md").operation, "conflict");
  assert.equal(plan.artifacts.find((artifact) => artifact.path === ".github/workflows/ci.yml").operation, "conflict");
  assert.equal(plan.commands[0].command, "No command is scheduled by default.");
});

test("existing workspace inventory detects current stack and CI without writes", async () => {
  const root = path.resolve("server/test/fixtures/existing");
  const inventory = await inspectWorkspace({ root });
  assert.equal(inventory.state, "existing");
  assert.ok(inventory.languages.includes("typescript"));
  assert.equal(inventory.detected.githubActions, true);
  assert.ok(inventory.files.includes("src/main.ts"));
});

test("workspace inventory identifies existing configuration ownership paths", async () => {
  const root = path.resolve("server/test/fixtures/configured");
  const inventory = await inspectWorkspace({ root });
  assert.ok(inventory.languages.includes("typescript"));
  assert.deepEqual(inventory.configuration.pullRequestTemplates, ["docs/pull_request_template.md"]);
  assert.deepEqual(inventory.configuration.codeowners, [".github/CODEOWNERS"]);
  assert.deepEqual(inventory.configuration.codexConfigs, [".codex/config.toml"]);
  assert.equal(inventory.accessScope.mode, "host-boundary-not-configured");
});

test("AGENTS guide evidence is grounded in local paths and declared script names", async () => {
  const root = path.resolve("server/test/fixtures/agents-evidence");
  const inventory = await inspectWorkspace({ root });
  const evidence = inventory.agentGuideEvidence;

  assert.deepEqual(evidence.repositoryMap.sourceRoots, ["packages/", "packages/api/src/", "src/"]);
  assert.deepEqual(evidence.repositoryMap.testRoots, ["tests/"]);
  assert.deepEqual(evidence.repositoryMap.documentationRoots, ["docs/"]);
  assert.deepEqual(evidence.repositoryMap.manifestPaths, ["package.json", "packages/api/package.json"]);
  assert.deepEqual(evidence.verification.commands.map((entry) => entry.command), [
    "pnpm run lint",
    "pnpm run test",
    "pnpm run typecheck",
    "pnpm run test:integration"
  ]);
  assert.deepEqual(evidence.verification.commands.map((entry) => entry.workingDirectory), [
    "workspace root",
    "workspace root",
    "workspace root",
    "packages/api/"
  ]);
  assert.deepEqual(evidence.boundaries.lockfiles, ["pnpm-lock.yaml"]);
  assert.deepEqual(evidence.boundaries.generatedFileHints, ["src/api.generated.ts"]);
  assert.equal(JSON.stringify(evidence).includes("vitest run --coverage"), false);

  const blueprint = createAgentsGuideBlueprint(inventory, { localScope: "nested-where-needed" });
  assert.equal(blueprint.status, "grounded");
  assert.match(blueprint.templateValues.repositoryMap, /`packages\/api\/src\//);
  assert.match(blueprint.templateValues.repositoryMap, /`packages\/api\/package\.json`/);
  assert.match(blueprint.templateValues.verificationCommands, /`pnpm run test`/);
  assert.match(blueprint.templateValues.boundaries, /`src\/api\.generated\.ts`/);
  assert.match(blueprint.templateValues.localGuidance, /`packages\/api\/src\//);
  assert.match(blueprint.templateValues.codingConventions, /closest established local pattern/);
  assert.match(blueprint.templateValues.reviewRules, /consequential, non-obvious invariant/);

  const functionalBlueprint = createAgentsGuideBlueprint(inventory, {
    codingStyle: "functional-core",
    functionDesign: "separate-effects",
    commentStyle: "minimal"
  });
  assert.match(functionalBlueprint.templateValues.codingConventions, /functional core/);
  assert.match(functionalBlueprint.templateValues.codingConventions, /Separate orchestration and side effects/);
  assert.match(functionalBlueprint.templateValues.codingConventions, /Prefer clear names/);

  const plan = createPlan(catalog, {
    selectedIds: ["profile.web-fullstack"],
    inventory,
    guideDecisions: { agents: { profile: "contextual", localScope: "nested-where-needed" } }
  });
  assert.equal(plan.agentsGuide.status, "grounded");
  assert.equal(plan.agentsGuide.review.required, true);
});

test("AGENTS guidance preserves discovered local instructions and reports unavailable checks", () => {
  const files = ["package.json", "src/index.ts", "packages/api/AGENTS.md"];
  const evidence = createAgentGuideEvidence(files, {
    packageJson: JSON.stringify({ scripts: { test: "node --test" } })
  });
  const blueprint = createAgentsGuideBlueprint({ agentGuideEvidence: evidence }, { localScope: "nested-where-needed" });

  assert.match(blueprint.templateValues.localGuidance, /`packages\/api\/AGENTS\.md`/);
  assert.match(blueprint.templateValues.localGuidance, /must remain a conflict rather than be overwritten/);
  assert.match(blueprint.templateValues.localGuidance, /Do not generate nested AGENTS\.md files/);
  assert.match(blueprint.templateValues.verificationCommands, /`npm run test`/);
});

test("Flutter SDK declarations provide bounded standard verification commands", () => {
  const files = ["pubspec.yaml", "pubspec.lock", "lib/main.dart", "test/widget_test.dart"];
  const flutterPubspec = [
    "name: mobile_console",
    "environment:",
    "  sdk: ^3.6.0",
    "dependencies:",
    "  flutter:",
    "    sdk: flutter"
  ].join("\n");
  const evidence = createAgentGuideEvidence(files, { pubspec: flutterPubspec });
  assert.deepEqual(evidence.verification.commands.map((entry) => entry.command), ["flutter analyze", "flutter test"]);
  assert.deepEqual(evidence.verification.commands.map((entry) => entry.source), [
    "pubspec.yaml#dependencies.flutter",
    "pubspec.yaml#dependencies.flutter"
  ]);
  assert.deepEqual(evidence.boundaries.lockfiles, ["pubspec.lock"]);

  const blueprint = createAgentsGuideBlueprint({ agentGuideEvidence: evidence, files }, {}, { selectedIds: ["profile.mobile-app", "language.flutter"] });
  assert.equal(blueprint.documentStructure.effective, "multi-surface");
  assert.match(blueprint.templateValues.verificationCommands, /Flutter static analysis/);

  const dartOnly = createAgentGuideEvidence(files, { pubspec: "name: command_line_tool\nenvironment:\n  sdk: ^3.6.0\n" });
  assert.equal(dartOnly.verification.commands.length, 0);
});

test("AGENTS document shape is selected from reviewed project evidence and may be overridden", () => {
  const inventory = {
    files: ["package.json", "apps/web/src/index.ts", "packages/api/package.json", "src/client.generated.ts"],
    agentGuideEvidence: createAgentGuideEvidence(
      ["package.json", "apps/web/src/index.ts", "packages/api/package.json", "src/client.generated.ts"],
      { packageManifests: [
        { path: "package.json", content: JSON.stringify({ scripts: { test: "node --test" } }) },
        { path: "packages/api/package.json", content: JSON.stringify({ scripts: { test: "node --test" } }) }
      ] }
    )
  };
  const automatic = createAgentsGuideBlueprint(inventory, {}, { selectedIds: ["profile.data-ai", "ai.rag"] });
  assert.equal(automatic.documentStructure.effective, "sdk-ai");
  assert.match(automatic.templateValues.documentModel, /SDK \/ AI contract guide/);
  assert.match(automatic.templateValues.operationalBoundaries, /model output, tool output, MCP responses/);
  assert.match(automatic.templateValues.boundaries, /`src\/client\.generated\.ts`/);
  assert.ok(automatic.templateValues.generatedSync);

  const explicit = createAgentsGuideBlueprint(inventory, { documentStructure: "service-mcp" }, { selectedIds: ["profile.data-ai"] });
  assert.equal(explicit.documentStructure.effective, "service-mcp");
  assert.match(explicit.templateValues.taskRouting, /interface, transport, authentication/);
});

test("Codex setting inspection uses project preferences before user preferences without exposing raw config", async () => {
  const root = path.resolve("server/test/fixtures/existing");
  const settings = await inspectCodexSettings(root, {
    globalConfigPath: path.resolve("server/test/fixtures/codex-user-config.toml"),
    localConfigPath: path.resolve("server/test/fixtures/codex-project-config.toml")
  });

  assert.equal(settings.user.exists, true);
  assert.equal(settings.project.exists, true);
  assert.deepEqual(settings.effective.locale, { value: "ko", source: "project" });
  assert.deepEqual(settings.user.projectBootstrap, { locale: "en" });
  assert.equal(JSON.stringify(settings).includes("not-exposed"), false);
});

test("programming-language preservation and response-locale selection are separate", () => {
  const configured = {
    effective: { locale: { value: "ko", source: "user" } }
  };
  const detected = determineProgrammingLanguageDecision(["typescript"]);
  assert.equal(detected.action, "preserve-detected");
  assert.deepEqual(detected.detectedLanguages, ["typescript"]);
  assert.equal(determineProgrammingLanguageDecision([]).action, "defer-to-profile");

  const configuredLocale = determineResponseLocaleDecision(configured);
  assert.equal(configuredLocale.action, "apply-codex-setting");
  assert.equal(configuredLocale.locale, "ko");

  assert.equal(determineResponseLocaleDecision({ effective: {} }).action, "ask-user");
});

test("workspace inventory preserves a detected programming language while applying a response locale", async () => {
  const root = path.resolve("server/test/fixtures/existing");
  const inventory = await inspectWorkspace({
    root,
    globalCodexConfigPath: path.resolve("server/test/fixtures/codex-user-config.toml"),
    localCodexConfigPath: path.resolve("server/test/fixtures/codex-project-config.toml")
  });

  assert.ok(inventory.languages.includes("typescript"));
  assert.equal(inventory.programmingLanguageDecision.action, "preserve-detected");
  assert.equal(inventory.responseLocaleDecision.action, "apply-codex-setting");
  assert.equal(inventory.responseLocaleDecision.locale, "ko");
});

test("update comparison is semantic and does not use the network", () => {
  assert.equal(checkUpdates({ installedVersion: "0.1.0", availableVersion: "0.2.0" }).updateAvailable, true);
  assert.equal(checkUpdates({ installedVersion: "1.1.0", availableVersion: "2.0.0" }).updateAvailable, true);
  assert.equal(checkUpdates({ installedVersion: "1.1.0", availableVersion: "1.0.9" }).updateAvailable, false);
});
