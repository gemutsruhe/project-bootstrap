import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const skillPath = path.join(
  HERE,
  "../../plugins/project-bootstrap/skills/project-bootstrap/SKILL.md"
);

test("bootstrap skill uses progressive selectable questions with a free-text fallback", () => {
  const skill = fs.readFileSync(skillPath, "utf8");

  assert.match(skill, /Never present the full questionnaire at once\./);
  assert.match(skill, /one decision at a time/);
  assert.match(skill, /Other.*comment response as a first-class answer/);
  assert.match(skill, /numbered Markdown list ending in `Other — describe your situation`/);
  assert.match(skill, /never approval to write files or run commands/);
  assert.ok(
    skill.indexOf("Existing language and Codex defaults.") < skill.indexOf("Product or service goal and starting profile."),
    "language handling must precede the product profile"
  );
  assert.match(skill, /action is `preserve-detected`/);
  assert.match(skill, /action is `apply-codex-setting`/);
  assert.match(skill, /action is `ask-user`/);
  assert.match(skill, /never request, echo, copy, or rewrite raw Codex configuration/);
  assert.match(skill, /codexSettings\.effective\.locale/);
});

test("bootstrap skill opens an MCP Apps catalogue explorer instead of claiming native split tabs", () => {
  const skill = fs.readFileSync(skillPath, "utf8");

  assert.match(skill, /render_catalog_explorer/);
  assert.match(skill, /packaged source Markdown in the MCP Apps UI/);
  assert.doesNotMatch(skill, /open files in a split tab/);
});
