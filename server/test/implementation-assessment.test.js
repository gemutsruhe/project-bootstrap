import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { assessImplementation } from "../src/core.js";

async function workspace(t, files) {
  const parent = path.resolve(os.tmpdir());
  const root = await fs.mkdtemp(path.join(parent, "project-bootstrap-assessment-"));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), parent);
    assert.ok(path.basename(root).startsWith("project-bootstrap-assessment-"));
    await fs.rm(root, { recursive: true, force: true });
  });
  for (const [relative, content] of Object.entries(files)) {
    const target = path.resolve(root, relative);
    assert.ok(target.startsWith(root + path.sep));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return root;
}

test("assessment separates file evidence, declared checks, and caller-reported results", async (t) => {
  const root = await workspace(t, {
    "package.json": JSON.stringify({ scripts: { test: "node --test", build: "next build" } }),
    "src/app/api/events/route.ts": "export const POST = () => new Response();\n",
    "README.md": "No product implementation yet.\n"
  });
  const result = await assessImplementation({
    root,
    requirements: [
      { id: "create-event", description: "Create an event", evidencePaths: ["src/app/api/events/route.ts"], checkCommands: ["npm run test"] },
      { id: "rank-loss", description: "Track cumulative losses", evidencePaths: ["src/lib/ranking.ts"] },
      { id: "invite-flow", description: "Invite participants" }
    ],
    reportedChecks: [{ command: "npm run test", status: "passed", source: "user-provided CI log #12" }]
  });
  assert.equal(result.status, "needs-review");
  assert.deepEqual(result.criteria.map((item) => item.status), ["requires-behavior-review", "missing-file-evidence", "unmapped"]);
  assert.equal(result.criteria[0].checks[0].status, "passed");
  assert.equal(result.criteria[0].checks[0].provenance, "caller-reported");
  assert.ok(result.checks.some((item) => item.command === "npm run build" && item.status === "not-run"));
  assert.ok(result.documentationDrift.some((item) => item.code === "stale-product-absence"));
  assert.match(result.limitation, /do not establish acceptance behavior/);
});

test("assessment emits review prompts only for relevant source evidence", async (t) => {
  const root = await workspace(t, {
    "src/lib/db/schema.ts": "export const schema = {};\n",
    "src/app/edit/[token]/page.tsx": "export default function Page() {}\n",
    "src/lib/rate-limit.ts": "export const limit = () => true;\n"
  });
  const result = await assessImplementation({ root });
  assert.equal(result.reviewPrompts.length, 3);
  assert.ok(result.reviewPrompts.some((prompt) => /pool lifetime/.test(prompt)));
  assert.ok(result.reviewPrompts.some((prompt) => /editor-link leakage/.test(prompt)));
  assert.ok(result.reviewPrompts.some((prompt) => /trusted client address/.test(prompt)));
});

test("a reported root check does not certify the same command in a nested package", async (t) => {
  const root = await workspace(t, {
    "package.json": JSON.stringify({ scripts: { test: "node --test" } }),
    "apps/web/package.json": JSON.stringify({ scripts: { test: "node --test" } }),
    "apps/web/src/app/page.tsx": "export default function Page() {}\n"
  });
  const result = await assessImplementation({
    root,
    requirements: [{ id: "web", description: "Web app", evidencePaths: ["apps/web/src/app/page.tsx"], checkDirectory: "apps/web", checkCommands: ["npm run test"] }],
    reportedChecks: [{ command: "npm run test", status: "passed", source: "root log" }]
  });
  assert.equal(result.criteria[0].checks[0].status, "not-run");
  assert.equal(result.criteria[0].checks[0].declared, true);
  assert.ok(result.checks.some((item) => item.directory === "." && item.status === "passed"));
  assert.ok(result.checks.some((item) => item.directory === "apps/web" && item.status === "not-run"));
});

test("a caller-reported failed check is visible without becoming an independently verified verdict", async (t) => {
  const root = await workspace(t, {
    "package.json": JSON.stringify({ scripts: { test: "node --test" } }),
    "src/index.ts": "export const ready = true;\n"
  });
  const result = await assessImplementation({
    root,
    requirements: [{ id: "startup", description: "App starts", evidencePaths: ["src/index.ts"], checkCommands: ["npm run test"] }],
    reportedChecks: [{ command: "npm run test", status: "failed", source: "user-provided local log" }]
  });
  assert.equal(result.criteria[0].status, "reported-check-failed");
  assert.equal(result.criteria[0].checks[0].provenance, "caller-reported");
});

test("assessment rejects traversal and duplicate requirement IDs", async (t) => {
  const root = await workspace(t, { "README.md": "Project\n" });
  await assert.rejects(() => assessImplementation({ root, requirements: [
    { id: "unsafe", description: "unsafe path", evidencePaths: ["../outside"] }
  ] }), /Evidence paths/);
  await assert.rejects(() => assessImplementation({ root, requirements: [
    { id: "same", description: "first" }, { id: "same", description: "second" }
  ] }), /unique ID/);
});

test("full policy audit follows local references and returns complete, unique pages", async (t) => {
  const root = await workspace(t, {
    "package.json": JSON.stringify({ scripts: { test: "node --test" } }),
    "AGENTS.md": [
      "# Evidence policy",
      "The agent must inspect direct evidence. [Details](docs/rules.md)",
      "- Do not expose secrets."
    ].join("\n"),
    "docs/rules.md": [
      "## Command exception",
      "Except for tests, commands require approval.",
      "`docs/more.md`"
    ].join("\n"),
    "docs/more.md": "# Context\nThis describes the policy background.\n",
    ".codex/config.toml": 'secret_value = "must-not-be-returned"\n[project_bootstrap]\nlocale = "ko"\n'
  });
  const first = await assessImplementation({
    root,
    policyAudit: { entryDocuments: ["AGENTS.md"], pageSize: 2, includeConfiguration: "safe-summary" }
  });
  assert.equal(first.policyAudit.status, "ready");
  assert.equal(first.policyAudit.documents.length, 3);
  assert.equal(first.policyAudit.page.returnedItems, 2);
  assert.ok(first.policyAudit.nextPageToken);
  assert.match(first.policyAudit.items[0].id, /^AGENTS\.md#L/);
  assert.ok(first.policyAudit.items.some((item) => item.classification === "policy"));
  assert.equal(JSON.stringify(first.policyAudit.configuration).includes("must-not-be-returned"), false);
  assert.deepEqual(first.policyAudit.configuration.workspace.codexConfigs, [".codex/config.toml"]);

  const seen = [...first.policyAudit.items];
  let pageToken = first.policyAudit.nextPageToken;
  while (pageToken) {
    const page = await assessImplementation({ root, policyAudit: { entryDocuments: ["AGENTS.md"], pageSize: 2, pageToken } });
    assert.equal(page.policyAudit.status, "ready");
    seen.push(...page.policyAudit.items);
    pageToken = page.policyAudit.nextPageToken;
  }
  assert.equal(seen.length, first.policyAudit.totalItems);
  assert.equal(new Set(seen.map((item) => item.id)).size, seen.length);
  assert.ok(seen.some((item) => item.classification === "exception"));
});

test("full policy audit resolves bare inline-code document references relative to their containing document", async (t) => {
  const root = await workspace(t, {
    "docs/harness/README.md": "Use `HANDOFF_TEMPLATE.md` for every handoff.\n",
    "docs/harness/HANDOFF_TEMPLATE.md": "Do not expose secrets in handoff notes.\n"
  });
  const result = await assessImplementation({ root, policyAudit: { entryDocuments: ["docs/harness/README.md"] } });
  assert.equal(result.policyAudit.status, "ready");
  assert.deepEqual(
    result.policyAudit.documents.map((document) => document.path),
    ["docs/harness/HANDOFF_TEMPLATE.md", "docs/harness/README.md"]
  );
  assert.ok(result.policyAudit.items.some((item) => item.path === "docs/harness/HANDOFF_TEMPLATE.md"));
});

test("automatic policy audit discovers convention-named documents and preserves paged coverage", async (t) => {
  const root = await workspace(t, {
    "README.md": "This repository provides context.\n",
    "AGENTS.md": "# Agent rules\nThe agent must inspect direct evidence. [Details](docs/rules.md)\n",
    "docs/SECURITY.md": "# Security\nDo not expose secrets.\n",
    "docs/rules.md": "# Review rules\nCommands require approval.\n",
    "docs/background.md": "This background document is not an automatic entry document.\n"
  });
  const first = await assessImplementation({ root, policyAudit: { scope: "auto", pageSize: 1 } });
  assert.equal(first.policyAudit.status, "ready");
  assert.equal(first.policyAudit.entryDocumentSource, "auto");
  assert.equal(first.policyAudit.documentDiscovery.mode, "auto");
  assert.ok(first.policyAudit.documentDiscovery.selectedEntryDocuments.includes("AGENTS.md"));
  assert.ok(first.policyAudit.documentDiscovery.selectedEntryDocuments.includes("docs/SECURITY.md"));
  assert.ok(first.policyAudit.documents.some((document) => document.path === "docs/rules.md"));
  assert.ok(first.policyAudit.nextPageToken);

  const seen = [...first.policyAudit.items];
  let pageToken = first.policyAudit.nextPageToken;
  while (pageToken) {
    const page = await assessImplementation({ root, policyAudit: { scope: "auto", pageSize: 1, pageToken } });
    assert.equal(page.policyAudit.status, "ready");
    seen.push(...page.policyAudit.items);
    pageToken = page.policyAudit.nextPageToken;
  }
  assert.equal(seen.length, first.policyAudit.totalItems);
  assert.equal(new Set(seen.map((item) => item.id)).size, seen.length);
});

test("automatic policy audit blocks an empty or changed automatic scope", async (t) => {
  const root = await workspace(t, { "notes.md": "No named policy documents are present.\n" });
  const empty = await assessImplementation({ root, policyAudit: { scope: "auto" } });
  assert.equal(empty.status, "blocked");
  assert.equal(empty.policyAudit.reason, "policy-document-auto-discovery-empty");

  await fs.writeFile(path.join(root, "AGENTS.md"), "The agent must inspect evidence.\nMore policy text.\n");
  const first = await assessImplementation({ root, policyAudit: { scope: "auto", pageSize: 1 } });
  assert.ok(first.policyAudit.nextPageToken);
  await fs.mkdir(path.join(root, "docs"));
  await fs.writeFile(path.join(root, "docs", "SECURITY.md"), "Do not expose secrets.\n");
  const stale = await assessImplementation({ root, policyAudit: { scope: "auto", pageSize: 1, pageToken: first.policyAudit.nextPageToken } });
  assert.equal(stale.status, "blocked");
  assert.equal(stale.policyAudit.reason, "policy-audit-page-stale");

  await assert.rejects(
    () => assessImplementation({ root, policyAudit: { scope: "auto", entryDocuments: ["AGENTS.md"] } }),
    /entryDocuments.*scope/
  );
});

test("full policy audit blocks unsafe, cyclic, and stale document collections", async (t) => {
  const root = await workspace(t, {
    "AGENTS.md": "[Rules](docs/rules.md)\n",
    "docs/rules.md": "[Root](../AGENTS.md)\n",
    "outside.md": "outside\n"
  });
  const cyclic = await assessImplementation({ root, policyAudit: { entryDocuments: ["AGENTS.md"] } });
  assert.equal(cyclic.status, "blocked");
  assert.equal(cyclic.policyAudit.reason, "policy-document-cycle");

  await fs.writeFile(path.join(root, "AGENTS.md"), "[Outside](../outside.md)\n");
  const outside = await assessImplementation({ root, policyAudit: { entryDocuments: ["AGENTS.md"] } });
  assert.equal(outside.status, "blocked");
  assert.equal(outside.policyAudit.reason, "policy-document-outside-workspace");

  await fs.writeFile(path.join(root, "AGENTS.md"), "The agent must inspect evidence.\nMore policy text.\n");
  const first = await assessImplementation({ root, policyAudit: { entryDocuments: ["AGENTS.md"], pageSize: 1 } });
  assert.ok(first.policyAudit.nextPageToken);
  await fs.writeFile(path.join(root, "AGENTS.md"), "The agent must inspect changed evidence.\nMore policy text.\n");
  const stale = await assessImplementation({ root, policyAudit: { entryDocuments: ["AGENTS.md"], pageSize: 1, pageToken: first.policyAudit.nextPageToken } });
  assert.equal(stale.status, "blocked");
  assert.equal(stale.policyAudit.reason, "policy-audit-page-stale");
});

test("full policy audit catches cycles that span sibling document references", async (t) => {
  const root = await workspace(t, {
    "AGENTS.md": "[Left](docs/left.md)\n[Right](docs/right.md)\n",
    "docs/left.md": "[Shared](shared.md)\n",
    "docs/shared.md": "[Right](right.md)\n",
    "docs/right.md": "[Left](left.md)\n"
  });
  const result = await assessImplementation({ root, policyAudit: { entryDocuments: ["AGENTS.md"] } });
  assert.equal(result.status, "blocked");
  assert.equal(result.policyAudit.reason, "policy-document-cycle");
});

test("agent-executed checks retain caller evidence but take precedence for the effective verdict", async (t) => {
  const root = await workspace(t, {
    "package.json": JSON.stringify({ scripts: { test: "node --test" } }),
    "src/index.ts": "export const ready = true;\n"
  });
  const result = await assessImplementation({
    root,
    requirements: [{ id: "startup", description: "App starts", evidencePaths: ["src/index.ts"], checkCommands: ["npm run test"] }],
    reportedChecks: [{ command: "npm run test", status: "passed", source: "caller CI" }],
    executedChecks: [{ command: "npm run test", status: "failed", source: "authorized local transcript" }]
  });
  const check = result.criteria[0].checks[0];
  assert.equal(check.status, "failed");
  assert.equal(check.provenance, "agent-executed");
  assert.equal(check.evidence.length, 2);
  assert.deepEqual(check.evidence.map((item) => item.provenance), ["caller-reported", "agent-executed"]);
  assert.equal(result.criteria[0].status, "reported-check-failed");
});
