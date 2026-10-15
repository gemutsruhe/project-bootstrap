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
    skill.indexOf("Question-and-answer language and existing stack.") < skill.indexOf("Product or service goal and starting profile."),
    "response-language handling must precede the product profile"
  );
  assert.match(skill, /responseLocaleDecision\.action/);
  assert.match(skill, /programmingLanguageDecision\.action/);
  assert.match(skill, /Korean, English, or Other/);
  assert.match(skill, /never a programming-language choice/);
  assert.match(skill, /never request, echo, copy, or rewrite raw Codex configuration/);
  assert.match(skill, /selectedCatalogId/);
  assert.match(skill, /do not ask the same choice again/);
  assert.match(skill, /apply that exact ID as the user override/);
  assert.match(skill, /execute the approved file generation in the same turn/);
  assert.match(skill, /Do not stop at a hypothetical scaffold/);
  assert.match(skill, /write the real, non-empty file at the exact planned path/);
  assert.match(skill, /Do not claim a file was generated unless it exists in the workspace/);
  assert.match(skill, /approved Codex workspace guide bundle/);
  assert.match(skill, /`AGENTS\.md`, `ARCHITECTURE\.md`, `TEAM_GUIDE\.md`, `PLANS\.md`, and `CODE_REVIEW\.md`/);
  assert.match(skill, /do not claim that Codex automatically discovers them independently/);
  assert.match(skill, /workspace-guide-interview\.md/);
  assert.match(skill, /agents-authoring\.md/);
  assert.match(skill, /list_workspace_guide_policies/);
  assert.match(skill, /collaborationHost/);
  assert.match(skill, /Ask `\.github\/pull_request_template\.md` only when `collaborationHost` is `github`/);
  assert.match(skill, /Ask the profile question for one applicable guide at a time/);
  assert.match(skill, /Pass both `guideDecisions` and `workspaceSettings`/);
  assert.match(skill, /`agentsGuide` evidence and template preview/);
  assert.match(skill, /AGENTS_REPOSITORY_MAP/);
  assert.match(skill, /Do not let an answer weaken the Skill's approval gates/);
  assert.match(skill, /Do not ask for product features, user workflows, acceptance criteria, or implementation details/);
  assert.match(skill, /Do not create product-specific screens, API endpoints, business logic, database schemas, sample user flows, or feature tests/);
  assert.match(skill, /flutter create --no-pub --project-name <project_name> \./);
  assert.match(skill, /The file-plan approval does not authorize this command/);
  assert.match(skill, /Never create or rewrite `\.codex\/config\.toml`/);
  assert.match(skill, /marked `conflict` or `merge-preview`/);
  assert.doesNotMatch(skill, /First working slice/);
});

test("workspace guide templates make their task-specific relationship explicit", () => {
  const templateRoot = path.join(HERE, "../../plugins/project-bootstrap/templates/common");
  const agents = fs.readFileSync(path.join(templateRoot, "AGENTS.md.tmpl"), "utf8");

  assert.match(agents, /Read only the guide relevant to the task/);
  for (const placeholder of ["AGENTS_REPOSITORY_MAP", "AGENTS_VERIFICATION_COMMANDS", "AGENTS_BOUNDARIES", "AGENTS_LOCAL_GUIDANCE", "AGENTS_CODING_CONVENTIONS", "AGENTS_REVIEW_RULES"]) {
    assert.match(agents, new RegExp("\\{\\{" + placeholder + "\\}\\}"));
  }
  for (const name of ["ARCHITECTURE.md", "TEAM_GUIDE.md", "PLANS.md", "CODE_REVIEW.md"]) {
    assert.match(agents, new RegExp(name.replace(".", "\\.")));
  }
  for (const name of ["ARCHITECTURE.md.tmpl", "TEAM_GUIDE.md.tmpl", "PLANS.md.tmpl", "CODE_REVIEW.md.tmpl", "pull-request-template.md.tmpl"]) {
    assert.equal(fs.existsSync(path.join(templateRoot, name)), true, name);
  }
});

test("workspace guide templates and interview reference retain reviewed decisions", () => {
  const templateRoot = path.join(HERE, "../../plugins/project-bootstrap/templates/common");
  const decisionPlaceholders = [
    ["AGENTS.md.tmpl", "AGENTS_GUIDE_DECISIONS"],
    ["ARCHITECTURE.md.tmpl", "ARCHITECTURE_GUIDE_DECISIONS"],
    ["TEAM_GUIDE.md.tmpl", "TEAM_GUIDE_DECISIONS"],
    ["PLANS.md.tmpl", "PLANS_GUIDE_DECISIONS"],
    ["CODE_REVIEW.md.tmpl", "CODE_REVIEW_GUIDE_DECISIONS"],
    ["pull-request-template.md.tmpl", "PULL_REQUEST_GUIDE_DECISIONS"]
  ];
  for (const [name, placeholder] of decisionPlaceholders) {
    assert.match(fs.readFileSync(path.join(templateRoot, name), "utf8"), new RegExp("\\{\\{" + placeholder + "\\}\\}"));
  }

  const interview = fs.readFileSync(
    path.join(HERE, "../../plugins/project-bootstrap/skills/project-bootstrap/references/workspace-guide-interview.md"),
    "utf8"
  );
  for (const heading of ["AGENTS.md", "ARCHITECTURE.md", "TEAM_GUIDE.md", "PLANS.md", "CODE_REVIEW.md", ".github/pull_request_template.md"]) {
    assert.match(interview, new RegExp(heading.replace(".", "\\.")));
  }
  assert.match(interview, /## 0\. Collaboration host/);
  assert.match(interview, /`collaborationHost` is `github`/);

  const agentsAuthoring = fs.readFileSync(
    path.join(HERE, "../../plugins/project-bootstrap/skills/project-bootstrap/references/agents-authoring.md"),
    "utf8"
  );
  assert.match(agentsAuthoring, /Codex Prompting Guide/);
  assert.match(agentsAuthoring, /Custom Code Review rules for Codex/);
  assert.match(agentsAuthoring, /local inventory evidence/);
});

test("bootstrap skill opens an MCP Apps catalogue explorer instead of claiming native split tabs", () => {
  const skill = fs.readFileSync(skillPath, "utf8");

  assert.match(skill, /render_catalog_explorer/);
  assert.match(skill, /packaged source Markdown in the MCP Apps UI/);
  assert.doesNotMatch(skill, /open files in a split tab/);
});
