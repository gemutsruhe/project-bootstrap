import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  checkUpdates,
  createPlan,
  inspectWorkspace,
  listCatalog,
  loadCatalog,
  parseFrontmatter,
  recommend,
  validateSelection
} from "../src/core.js";

const catalog = await loadCatalog();

test("parses flat YAML frontmatter with locale fields and lists", () => {
  const parsed = parseFrontmatter("---\nid: sample\ntags: [one, two]\ntitle_en: Sample\n---\nBody\n");
  assert.equal(parsed.attributes.id, "sample");
  assert.deepEqual(parsed.attributes.tags, ["one", "two"]);
  assert.equal(parsed.body, "Body\n");
});

test("catalogue has the five required profiles and Korean fallback data", () => {
  const profiles = listCatalog(catalog, { kind: "profile", locale: "ko" });
  assert.equal(profiles.length, 5);
  assert.ok(profiles.some((profile) => profile.id === "profile.web-fullstack" && /웹/.test(profile.label)));
  assert.ok(profiles.every((profile) => path.isAbsolute(profile.localPath) && profile.localPath.endsWith(".md")));
  assert.ok(catalog.length >= 30);
});

test("each supported starting profile produces a non-writing review plan", () => {
  const profileIds = [
    "profile.web-fullstack",
    "profile.api-service",
    "profile.mobile-app",
    "profile.data-ai",
    "profile.multi-service-platform"
  ];
  for (const id of profileIds) {
    const plan = createPlan(catalog, { selectedIds: [id], inventory: { files: [] } });
    assert.notEqual(plan.status, "blocked", id);
    assert.ok(plan.artifacts.every((artifact) => artifact.approvalRequired), id);
    assert.equal(plan.commands[0].approvalRequired, true, id);
  }
});

test("recommendation remains explainable and preserves explicit preference", () => {
  const results = recommend(catalog, {
    requirements: { productType: "web", teamSize: 2, operationsPreference: "low", preferredIds: ["profile.web-fullstack"] },
    inventory: { languages: ["typescript"] }
  });
  assert.equal(results[0].id, "profile.web-fullstack");
  assert.ok(results[0].reasons.some((reason) => reason.kind === "explicit-preference"));
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

test("plans mark existing paths as conflicts and do not schedule commands", () => {
  const plan = createPlan(catalog, {
    selectedIds: ["language.typescript"],
    inventory: { files: ["AGENTS.md", ".github/workflows/ci.yml"] }
  });
  assert.equal(plan.status, "ready");
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

test("update comparison is semantic and does not use the network", () => {
  assert.equal(checkUpdates({ installedVersion: "0.1.0", availableVersion: "0.2.0" }).updateAvailable, true);
  assert.equal(checkUpdates({ installedVersion: "1.1.0", availableVersion: "2.0.0" }).updateAvailable, true);
  assert.equal(checkUpdates({ installedVersion: "1.1.0", availableVersion: "1.0.9" }).updateAvailable, false);
});
