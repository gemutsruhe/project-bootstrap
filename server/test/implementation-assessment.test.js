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
