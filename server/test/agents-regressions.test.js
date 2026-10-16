import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAgentGuideEvidence, createAgentsGuideBlueprint, createPlan, inspectWorkspace, loadCatalog } from "../src/core.js";
import { hasFlutterSdk } from "../src/agent-evidence.js";
import { AGENTS_ROOT_BUDGET_BYTES } from "../src/agents-guide.js";
import { normalizeGuideDecisions } from "../src/guide-policies.js";

const catalog = await loadCatalog();
const pkg = (extra = {}) => JSON.stringify({ scripts: { lint: "eslint .", test: "node --test" }, ...extra });
const flutter = "name: demo\ndependencies:\n  flutter:\n    sdk: flutter\n";
const inventoryFor = (files, options = {}) => ({ state: "existing", files: Object.keys(files), agentGuideEvidence: createAgentGuideEvidence(Object.keys(files), { manifests: Object.entries(files).map(([path, content]) => ({ path, content })), ...options }) });

async function workspace(t, files) {
  const parent = path.resolve(os.tmpdir());
  const root = await fs.mkdtemp(path.join(parent, "project-bootstrap-test-"));
  t.after(async () => {
    // Delete only the exact mkdtemp directory owned by this test.
    assert.equal(path.dirname(path.resolve(root)), parent);
    assert.ok(path.basename(root).startsWith("project-bootstrap-test-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  for (const [file, content] of Object.entries(files)) {
    const target = path.resolve(root, file);
    assert.ok(target.startsWith(root + path.sep));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return root;
}

async function inspectFixture(t, files, options = {}) {
  const root = await workspace(t, files);
  return inspectWorkspace({ root, maxDepth: 12, maxFiles: 2000, globalCodexConfigPath: path.join(root, "__no-user-config__"), ...options });
}

test("an explicit package manager takes precedence over a conflicting lockfile", () => {
  const evidence = createAgentGuideEvidence(["package.json", "pnpm-lock.yaml", "src/index.ts"], {
    packageJson: JSON.stringify({ packageManager: "yarn@4.0.0", scripts: { test: "node --test" } })
  });
  assert.equal(evidence.verification.commands[0].command, "yarn test");
  assert.ok(evidence.verification.warnings.length);
});

test("a web check does not cover an independently configured Python service", () => {
  const files = ["package.json", "src/index.ts", "services/api/pyproject.toml", "services/api/app/main.py"];
  const agentGuideEvidence = createAgentGuideEvidence(files, {
    packageJson: JSON.stringify({ scripts: { lint: "eslint ." } })
  });
  const guide = createAgentsGuideBlueprint({ files, agentGuideEvidence });
  assert.equal(guide.status, "needs-confirmation");
  assert.ok(guide.evidence.verification.areas.some((area) => area.directory === "services/api" && area.status === "needs-confirmation"));
});

test("two runtimes sharing a directory retain independent verification gaps", () => {
  const inv = inventoryFor({ "package.json": pkg(), "pyproject.toml": '[project]\nname="api"', "src/web.ts": "", "src/api.py": "" });
  const guide = createAgentsGuideBlueprint(inv);
  assert.equal(guide.evidence.verification.areas.find((area) => area.runtime === "node").status, "declared");
  assert.equal(guide.evidence.verification.areas.find((area) => area.runtime === "python").status, "needs-confirmation");
  assert.equal(guide.status, "needs-confirmation");
});

test("a lint-only guide explicitly discloses missing tests and unexecuted commands", () => {
  const inv = inventoryFor({ "apps/web/package.json": pkg({ scripts: { lint: "eslint ." } }), "apps/web/src/a.ts": "" });
  const guide = createAgentsGuideBlueprint(inv, {}, { locale: "ko" });
  assert.match(guide.markdown, /선언된 명령이며 실행 결과가 아닙니다/);
  assert.match(guide.markdown, /테스트 명령 미확인 영역: `apps\/web`/);
  assert.match(guide.markdown, /정적 검사나 빌드 명령만으로 테스트 범위가 확인되지는 않습니다/);
  const withTests = createAgentsGuideBlueprint(inventoryFor({ "package.json": pkg(), "src/a.ts": "" }));
  assert.doesNotMatch(withTests.markdown, /Test commands unconfirmed:/);
});

test("package manager resolution respects local scope, inheritance and ambiguity", () => {
  const scenarios = [
    [{ "package.json": pkg({ packageManager: "npm@10" }), "yarn.lock": "", "src/a.ts": "" }, "npm run test"],
    [{ "apps/a/package.json": pkg(), "apps/a/pnpm-lock.yaml": "", "apps/a/src/a.ts": "" }, "pnpm run test"],
    [{ "package.json": pkg({ packageManager: "pnpm@10", scripts: {} }), "packages/a/package.json": pkg(), "packages/a/src/a.ts": "" }, "pnpm run test"],
    [{ "package.json": pkg({ packageManager: "pnpm@10", scripts: {} }), "packages/a/package.json": pkg({ packageManager: "bun@1" }), "packages/a/src/a.ts": "" }, "bun run test"]
  ];
  for (const [files, expected] of scenarios) assert.ok(inventoryFor(files).agentGuideEvidence.verification.commands.some((command) => command.command === expected));
  const ambiguous = inventoryFor({ "package.json": pkg(), "yarn.lock": "", "pnpm-lock.yaml": "", "src/a.ts": "" }).agentGuideEvidence;
  assert.equal(ambiguous.verification.commands.length, 0);
  assert.ok(ambiguous.verification.warnings.some((warning) => warning.code === "ambiguous-package-manager"));
});

test("invalid script values and shell bodies cannot become ordinary check evidence", () => {
  const files = { "package.json": pkg({ scripts: { test: null, lint: false, build: 1, typecheck: "" } }), "src/a.ts": "" };
  assert.deepEqual(inventoryFor(files).agentGuideEvidence.verification.commands, []);
  const scripts = { "test:watch": "vitest --watch", "test:live": "node live.mjs", "lint:fix": "eslint --fix .", "build:publish": "npm publish", test: "node --test PRIVATE_SCRIPT_SENTINEL" };
  const evidence = inventoryFor({ ...files, "package.json": pkg({ scripts }) }).agentGuideEvidence;
  assert.equal(evidence.verification.commands.filter((command) => command.suitableForVerification).length, 1);
  assert.ok(evidence.verification.commands.every((command) => command.executionStatus === "not-run" && command.requiresReview));
  assert.equal(JSON.stringify(evidence).includes("PRIVATE_SCRIPT_SENTINEL"), false);
});

test("Flutter recognition accepts block and flow dependencies but rejects unrelated SDK keys", () => {
  for (const content of [flutter, "dependencies:\n  flutter: { sdk: flutter }\n", "dependencies: { flutter: {sdk: flutter} }\n", "dependencies:\n  flutter:\n    sdk: 'flutter' # local SDK\n"]) assert.equal(hasFlutterSdk(content), true, content);
  for (const content of ["name: cli\nenvironment:\n  sdk: ^3.0.0\n", "metadata:\n  flutter:\n    sdk: flutter\n", "dependencies:\n  foo:\n    flutter:\n      sdk: flutter\n", "dependencies:\n  flutter:\n    metadata:\n      sdk: flutter\n"]) assert.equal(hasFlutterSdk(content), false, content);
});

const domainFixtures = [
  ["React web", { "package.json": pkg(), "src/App.tsx": "", "src/App.test.tsx": "" }, "typescript", "node"],
  ["Next.js mockup", { "package.json": pkg(), "app/page.tsx": "", "next-env.d.ts": "" }, "typescript", "node"],
  ["Node API", { "package.json": pkg(), "src/main.ts": "", "test/api.spec.ts": "" }, "typescript", "node"],
  ["Python API", { "pyproject.toml": '[project]\nname="api"\n[tool.pytest.ini_options]\ntestpaths=["tests"]\n', "src/api.py": "", "tests/test_api.py": "" }, "python", "python"],
  ["Java Maven", { "pom.xml": "<project/>", "mvnw": "", "mvnw.cmd": "", "src/main/java/App.java": "" }, "java", "maven"],
  ["Kotlin JVM", { "build.gradle.kts": 'plugins { kotlin("jvm") }', "gradlew": "", "gradlew.bat": "", "src/main/kotlin/App.kt": "" }, "kotlin", "gradle"],
  ["Android", { "build.gradle.kts": 'plugins { id("com.android.application") }', "app/src/main/App.kt": "", "app/src/androidTest/AppTest.kt": "" }, "kotlin", "gradle"],
  ["Go service", { "go.mod": "module example.test/api\n", "go.sum": "", "cmd/api/main.go": "", "internal/api/api_test.go": "" }, "go", "go"],
  [".NET", { "src/App/App.csproj": '<Project Sdk="Microsoft.NET.Sdk"/>', "src/App/Program.cs": "", "tests/App.Tests/App.Tests.csproj": "<Project><IsTestProject>true</IsTestProject></Project>" }, "dotnet", "dotnet"],
  ["Flutter", { "pubspec.yaml": flutter, "lib/main.dart": "", "integration_test/main_test.dart": "", "ios/Runner/AppDelegate.swift": "" }, "flutter", "flutter"],
  ["Expo", { "package.json": pkg({ dependencies: { expo: "*" } }), "src/app/index.tsx": "", "app.json": "{}" }, "typescript", "node"],
  ["RAG", { "pyproject.toml": "[tool.pytest.ini_options]\n", "src/rag.py": "", "evals/retrieval.py": "", "prompts/system.md": "" }, "python", "python"],
  ["Data batch", { "pyproject.toml": '[project]\nname="batch"\n', "pipelines/daily.py": "", "notebooks/report.ipynb": "{}", "datasets/input.csv": "" }, "python", "python"],
  ["Mixed services", { "package.json": pkg(), "src/web.ts": "", "services/api/pyproject.toml": '[project]\nname="api"', "services/api/app/main.py": "" }, "python", "python"],
  ["TypeScript SDK", { "package.json": pkg({ exports: { ".": "./dist/index.js" } }), "src/index.ts": "" }, "typescript", "node"],
  ["MCP", { "package.json": pkg(), "server/transport.ts": "", "tests/protocol.test.ts": "" }, "typescript", "node"],
  ["Distribution", { "package.json": pkg(), "src/core.ts": "", "dist/core.js": "" }, "typescript", "node"],
  ["Rust", { "Cargo.toml": '[package]\nname="app"\nversion="0.1.0"', "src/lib.rs": "", "Cargo.lock": "" }, "rust", "rust"],
  ["Swift", { "Package.swift": "// swift-tools-version: 6.0", "Sources/App/App.swift": "", "Tests/AppTests/Test.swift": "" }, "swift", "swift"],
  ["Terraform", { "main.tf": "", ".terraform.lock.hcl": "", "modules/network/main.tf": "" }, "terraform", "terraform"],
  ["Plain Dart", { "pubspec.yaml": "name: cli\n", "lib/main.dart": "" }, "dart", "dart"],
  ["Nested Node", { "apps/site/package.json": pkg(), "apps/site/pnpm-lock.yaml": "", "apps/site/src/main.ts": "" }, "typescript", "node"],
  ["Groovy Gradle", { "build.gradle": "plugins { id 'java' }", "settings.gradle": "", "gradlew": "", "gradlew.bat": "" }, "jvm", "gradle"],
  ["Flutter flow YAML", { "pubspec.yaml": "dependencies:\n  flutter: { sdk: flutter }\n", "lib/main.dart": "" }, "flutter", "flutter"],
  ["Python requirements", { "requirements-dev.txt": "pytest>=8\n", "app/main.py": "", "tests/test_app.py": "" }, "python", "python"]
];

for (const [name, files, language, runtime] of domainFixtures) {
  test(`real workspace inventory and rendered guide: ${name}`, async (t) => {
    const inventory = await inspectFixture(t, files);
    assert.equal(inventory.truncated, false);
    assert.equal(inventory.agentGuideEvidence.verification.collection.complete, true);
    assert.ok(inventory.languages.includes(language), name);
    const area = inventory.agentGuideEvidence.verification.areas.find((candidate) => candidate.runtime === runtime);
    assert.ok(area, name);
    if (["rust", "swift", "terraform", "dart"].includes(runtime)) assert.equal(area.status, "unsupported");
    const guide = createAgentsGuideBlueprint(inventory, {}, { locale: "ko", projectName: name });
    assert.match(guide.markdown, /에이전트 지침/);
    assert.equal(/\{\{[A-Z_]+\}\}/.test(guide.markdown), false);
    assert.ok(Buffer.byteLength(guide.markdown) <= AGENTS_ROOT_BUDGET_BYTES);
  });
}

test("platform, pipeline, colocated test and checksum paths are retained", () => {
  const inv = inventoryFor({ "go.mod": "module test.local/app", "go.sum": "", "cmd/api/main.go": "", "internal/api/api_test.go": "", "integration_test/app_test.dart": "", "android/app/src/androidTest/Test.kt": "", "ios/Runner/App.swift": "", "evals/test.py": "", "datasets/input.csv": "", "pipelines/task.py": "" });
  const { repositoryMap: map, boundaries } = inv.agentGuideEvidence;
  for (const directory of ["cmd/", "internal/", "ios/", "pipelines/"]) assert.ok(map.sourceRoots.includes(directory));
  for (const directory of ["internal/api/", "integration_test/", "android/app/src/androidTest/", "evals/"]) assert.ok(map.testRoots.includes(directory));
  assert.ok(map.dataRoots.includes("datasets/"));
  assert.deepEqual(boundaries.managedDependencyFiles, ["go.sum"]);
});

test("Python checks require tool evidence and JVM commands use the host wrapper", () => {
  assert.equal(inventoryFor({ "pyproject.toml": '[project]\nname="pytest"\n', "src/a.py": "" }).agentGuideEvidence.verification.commands.length, 0);
  const python = inventoryFor({ "pyproject.toml": "[tool.pytest.ini_options]\n[tool.ruff]\n[tool.mypy]\n", "src/a.py": "" }).agentGuideEvidence;
  assert.deepEqual(python.verification.commands.map((command) => command.command), ["python -m pytest", "python -m ruff check .", "python -m mypy ."]);
  const files = { "pom.xml": "<project/>", "mvnw": "", "mvnw.cmd": "", "src/App.java": "" };
  assert.equal(inventoryFor(files, { platform: "win32" }).agentGuideEvidence.verification.commands[0].command, ".\\mvnw.cmd test");
  assert.equal(inventoryFor(files, { platform: "linux" }).agentGuideEvidence.verification.commands[0].command, "./mvnw test");
});

test("literal CI commands are scoped conservatively and never expose compound bodies", () => {
  const inv = inventoryFor({ "pyproject.toml": '[project]\nname="api"', "src/a.py": "", ".github/workflows/ci.yml": "jobs:\n  test:\n    steps:\n      - run: uv run pytest\n      - run: echo SECRET_SENTINEL && upload artifact\n" });
  assert.ok(inv.agentGuideEvidence.verification.commands.some((command) => command.command === "uv run pytest" && command.effects.includes("network")));
  assert.equal(JSON.stringify(inv.agentGuideEvidence).includes("SECRET_SENTINEL"), false);
  const dynamic = inventoryFor({ "package.json": pkg({ scripts: {} }), "src/a.ts": "", ".github/workflows/ci.yml": "defaults:\n  run:\n    working-directory: apps/web\njobs:\n  test:\n    steps:\n      - run: npm run test\n" });
  assert.equal(dynamic.agentGuideEvidence.verification.commands.length, 0);
  assert.ok(dynamic.agentGuideEvidence.verification.warnings.some((warning) => warning.code === "ci-working-directory-needs-review"));
  const fixer = inventoryFor({ "package.json": pkg({ scripts: { "lint:fix": "eslint --fix ." } }), "src/a.ts": "", ".github/workflows/ci.yml": "jobs:\n  lint:\n    steps:\n      - run: npm run lint:fix\n" });
  assert.equal(fixer.agentGuideEvidence.verification.commands.length, 1);
  assert.equal(fixer.agentGuideEvidence.verification.commands[0].suitableForVerification, false);
  const mismatch = inventoryFor({ "package.json": pkg({ packageManager: "pnpm@10" }), "src/a.ts": "", ".github/workflows/ci.yml": "jobs:\n  test:\n    steps:\n      - run: npm run test\n" });
  assert.equal(mismatch.agentGuideEvidence.verification.commands.some((command) => command.command === "npm run test"), false);
});

test("service, data, AI and package rules compose without changing unrelated projects", () => {
  const inv = inventoryFor({ "package.json": pkg({ scripts: {} }), "apps/web/package.json": pkg(), "apps/web/src/a.ts": "", "services/api/pyproject.toml": "[tool.pytest.ini_options]\n", "services/api/src/a.py": "" });
  const guide = createAgentsGuideBlueprint(inv, {}, { selectedIds: ["profile.multi-service-platform", "ai.rag"] });
  for (const facet of ["service", "ai", "multi-surface"]) assert.ok(guide.documentStructure.facets.includes(facet));
  assert.match(guide.markdown, /producer or consumer/);
  assert.match(guide.markdown, /model output/);
  const batch = createAgentsGuideBlueprint(inventoryFor({ "pyproject.toml": "[tool.pytest.ini_options]\n", "pipelines/run.py": "" }), {}, { selectedIds: ["profile.data-ai", "data.python-workload"] });
  assert.equal(batch.documentStructure.signals.ai, false);
  assert.doesNotMatch(batch.markdown, /model output/);
  const next = createAgentsGuideBlueprint(inventoryFor({ "package.json": pkg(), "app/page.tsx": "", "next-env.d.ts": "" }), {}, { selectedIds: ["profile.web-fullstack"] });
  assert.equal(next.documentStructure.effective, "router");
  assert.match(next.templateValues.boundaries, /next-env.d.ts/);
});

test("minimal, full-suite, routing and language choices change the rendered document", () => {
  const inv = inventoryFor({ "package.json": pkg(), "src/a.ts": "" });
  const make = (agents, locale = "en") => createPlan(catalog, { selectedIds: ["language.typescript"], inventory: inv, guideDecisions: { agents }, locale }).agentsGuide;
  const minimal = make({ profile: "minimal" });
  const contextual = make({ profile: "contextual" });
  const strict = make({ profile: "strict-governance" });
  assert.ok(minimal.markdown.length < contextual.markdown.length);
  assert.ok((minimal.markdown.match(/^## /gm) || []).length < (contextual.markdown.match(/^## /gm) || []).length);
  assert.match(minimal.markdown, /only when explicitly requested/);
  assert.match(strict.markdown, /full declared verification suite/);
  assert.doesNotMatch(strict.markdown, /run the narrowest declared verification command/);
  assert.match(strict.markdown, /written plan first/);
  assert.match(contextual.markdown, /run the narrowest declared verification command/);
  const korean = make({ profile: "strict-governance" }, "ko");
  assert.match(korean.markdown, /모든 프로젝트 영역/);
  assert.notEqual(korean.markdown, strict.markdown);
  assert.deepEqual(korean.evidence.verification.commands, strict.evidence.verification.commands);
  const explicitMinimal = make({ profile: "minimal", codingStyle: "functional-core", functionDesign: "separate-effects" });
  assert.match(explicitMinimal.markdown, /functional core/);
  assert.match(explicitMinimal.markdown, /Separate orchestration/);
  assert.match(minimal.markdown, /Repository map/);
});

test("structured context, scoped rules and user-confirmed checks resolve a precise gap", () => {
  const inv = inventoryFor({ "pyproject.toml": '[project]\nname="batch"', "pipelines/run.py": "" });
  const plan = createPlan(catalog, {
    selectedIds: ["language.python"], inventory: inv, locale: "ko",
    guideDecisions: { agents: { profile: "contextual", projectContext: "내부 일별 통계 작업", rules: [{ scope: "pipelines/", invariant: "같은 입력은 같은 집계 결과를 생성한다.", safeAlternative: "고정 fixture로 결과를 비교한다." }], reviewedCommands: [{ command: "python -m pytest tests", workingDirectory: ".", kind: "test", stage: "verification", effects: ["unknown", "writes-files"], confirmed: true }] } }
  });
  assert.equal(plan.agentsGuide.status, "grounded");
  assert.equal(plan.agentsGuide.evidence.verification.areas[0].status, "user-confirmed");
  assert.match(plan.agentsGuide.markdown, /내부 일별 통계 작업/);
  assert.match(plan.agentsGuide.markdown, /고정 fixture/);
  assert.match(plan.agentsGuide.markdown, /python -m pytest tests/);
  assert.equal(plan.commands[0].command, "No command is scheduled by default.");
  assert.throws(() => normalizeGuideDecisions({ agents: { profile: "contextual", reviewedCommands: [{ command: "echo x", confirmed: false }] } }), /confirmation/);
  assert.throws(() => normalizeGuideDecisions({ agents: { profile: "contextual", rules: [{ scope: "../", invariant: "x", safeAlternative: "y" }] } }), /relative/);
});

test("reviewed coverage and setup commands are distinct from implicit global coverage", () => {
  const inv = inventoryFor({ "package.json": pkg(), "src/a.ts": "", "services/api/pyproject.toml": '[project]\nname="api"', "services/api/src/a.py": "" });
  const decision = normalizeGuideDecisions({ agents: { profile: "contextual", reviewedCommands: [
    { command: "python -m pytest", workingDirectory: "services/api", covers: ["services/api"], kind: "test", stage: "verification", effects: ["unknown"], confirmed: true },
    { command: "python -m venv .venv", workingDirectory: "services/api", kind: "setup", stage: "setup", effects: ["writes-files"], confirmed: true }
  ] } }).agents;
  const guide = createAgentsGuideBlueprint(inv, decision);
  assert.equal(guide.status, "grounded");
  assert.match(guide.templateValues.setupGuidance, /python -m venv/);
  assert.doesNotMatch(guide.templateValues.verificationCommands, /python -m venv/);
});

test("override files trigger review and existing build systems are preserved", () => {
  const override = createPlan(catalog, { selectedIds: ["language.typescript"], inventory: inventoryFor({ "AGENTS.override.md": "local rules", "package.json": pkg(), "src/a.ts": "" }) });
  assert.equal(override.artifacts.find((artifact) => artifact.path === "AGENTS.md").operation, "merge-preview");
  assert.match(override.agentsGuide.markdown, /takes precedence/);
  for (const file of ["pom.xml", "build.gradle"]) {
    const plan = createPlan(catalog, { selectedIds: ["language.java"], inventory: inventoryFor({ [file]: "configuration", "src/App.java": "" }) });
    assert.equal(plan.artifacts.some((artifact) => artifact.path === "build.gradle.kts"), false);
  }
});

test("ordinary Node, Dart and Android paths are not mobile scaffold proof", () => {
  const expo = createPlan(catalog, { selectedIds: ["language.typescript", "mobile.expo"], inventory: inventoryFor({ "package.json": pkg(), "src/a.ts": "" }) });
  assert.equal(expo.scaffolds[0].operation, "requires-empty-workspace");
  for (const files of [{ "android/app/build.gradle.kts": "" }, { "pubspec.yaml": "name: cli", "lib/main.dart": "" }]) {
    const plan = createPlan(catalog, { selectedIds: ["language.flutter"], inventory: inventoryFor(files) });
    assert.equal(plan.scaffolds[0].operation, "requires-empty-workspace");
  }
});

test("detected runtime changes require an explicit planning decision", async (t) => {
  const inventory = await inspectFixture(t, { "pyproject.toml": '[project]\nname="api"', "src/a.py": "" });
  const plan = createPlan(catalog, { selectedIds: ["language.typescript"], inventory });
  assert.ok(plan.validation.messages.some((message) => message.code === "existing-runtime-review"));
  const accepted = createPlan(catalog, { selectedIds: ["language.typescript"], inventory, requirements: { runtimeChangeApproved: true } });
  assert.equal(accepted.validation.messages.some((message) => message.code === "existing-runtime-review"), false);
});

test("caches cannot consume traversal capacity and output boundaries remain visible", async (t) => {
  const files = { "package.json": pkg(), "src/a.ts": "", "dist/a.js": "" };
  for (const directory of [".dart_tool", ".gradle", "obj", "venv"]) for (let index = 0; index < 76; index++) files[`${directory}/${index}.cache`] = "";
  const inventory = await inspectFixture(t, files, { maxFiles: 300 });
  assert.equal(inventory.truncated, false);
  assert.equal(inventory.fileCount, 2);
  assert.ok(inventory.agentGuideEvidence.boundaries.outputDirectories.includes("dist/"));
  assert.ok(inventory.agentGuideEvidence.boundaries.outputDirectories.includes("obj/"));
});

test("all collected manifests are read and oversized metadata blocks a misleading plan", async (t) => {
  const files = { "package.json": pkg({ scripts: {} }) };
  for (let index = 0; index < 101; index++) { files[`packages/p${index}/package.json`] = pkg(); files[`packages/p${index}/src/a.ts`] = ""; }
  const inventory = await inspectFixture(t, files);
  assert.equal(inventory.agentGuideEvidence.verification.collection.readCount, 102);
  assert.equal(inventory.agentGuideEvidence.verification.commands.length, 202);
  const large = await inspectFixture(t, { "package.json": " ".repeat(128001), "src/a.ts": "" });
  assert.equal(large.truncated, false);
  assert.equal(large.agentGuideEvidence.verification.collection.complete, false);
  assert.equal(createPlan(catalog, { selectedIds: ["language.typescript"], inventory: large }).status, "blocked");
});

test("large monorepos get bounded root instructions and complete planned detail content", () => {
  const files = { "package.json": pkg({ scripts: {} }) };
  for (let index = 0; index < 99; index++) {
    files[`packages/p${index}/package.json`] = pkg({ scripts: { test: "node --test", lint: "eslint .", typecheck: "tsc", build: "tsc", "format:check": "prettier --check ." } });
    files[`packages/p${index}/src/a.ts`] = "";
  }
  const plan = createPlan(catalog, { selectedIds: ["language.typescript"], inventory: inventoryFor(files), locale: "ko" });
  const guide = plan.agentsGuide;
  assert.equal(guide.evidence.verification.commands.length, 495);
  assert.ok(Buffer.byteLength(guide.markdown) <= AGENTS_ROOT_BUDGET_BYTES);
  assert.equal(guide.supportingDocuments.length, 1);
  assert.match(guide.supportingDocuments[0].content, /packages\/p98\/package.json#scripts.test/);
  const detail = plan.artifacts.find((artifact) => artifact.template === "agents-evidence");
  assert.equal(detail.content, guide.supportingDocuments[0].content);
  assert.equal(plan.artifacts.find((artifact) => artifact.path === "AGENTS.md").content, guide.markdown);
  const conflicting = createPlan(catalog, { selectedIds: ["language.typescript"], inventory: inventoryFor({ ...files, [detail.path]: "existing user content" }) });
  assert.equal(conflicting.artifacts.find((artifact) => artifact.path === detail.path).operation, "conflict");
  assert.equal(conflicting.artifacts.find((artifact) => artifact.path === "AGENTS.md").operation, "merge-preview");
});

test("336 profile, document-shape and locale combinations preserve policy meaning", () => {
  const profiles = ["profile.interactive-mockup", "profile.web-fullstack", "profile.api-service", "profile.mobile-app", "profile.data-ai", "profile.multi-service-platform"];
  const policies = ["contextual", "minimal", "strict-governance", "custom"];
  const shapes = ["auto", "router", "multi-surface", "service-mcp", "sdk-ai", "generated-distribution", "custom"];
  const inventory = inventoryFor({ "package.json": pkg(), "src/a.ts": "" });
  let count = 0;
  for (const profile of profiles) for (const policy of policies) for (const shape of shapes) for (const locale of ["en", "ko"]) {
    const decision = { profile: policy, documentStructure: shape };
    if (policy === "custom" || shape === "custom") decision.comment = "Scope: public API; preserve compatibility using versioned adapters.";
    const plan = createPlan(catalog, { selectedIds: [profile, "language.typescript"], inventory, locale, guideDecisions: { agents: decision } });
    assert.notEqual(plan.status, "blocked");
    if (!["auto", "custom"].includes(shape)) assert.equal(plan.agentsGuide.documentStructure.effective, shape);
    if (policy === "strict-governance") assert.equal(plan.agentsGuide.markdown.includes(locale === "ko" ? "모든 프로젝트 영역" : "full declared verification suite"), true);
    assert.ok(Buffer.byteLength(plan.agentsGuide.markdown) <= AGENTS_ROOT_BUDGET_BYTES);
    count++;
  }
  assert.equal(count, 336);
});
