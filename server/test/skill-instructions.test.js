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
    skill.indexOf("Question-and-answer language and existing stack.") < skill.indexOf("Product or service form."),
    "response-language handling must precede the product form"
  );
  assert.match(skill, /Delivery target stage: mockup, MVP, or production foundation/);
  assert.match(skill, /For an MVP or production foundation, ask only the next needed operational constraint/);
  assert.match(skill, /For a mockup, skip these questions/);
  assert.match(skill, /responseLocaleDecision\.action/);
  assert.match(skill, /programmingLanguageDecision\.action/);
  assert.match(skill, /Korean, English, or Other/);
  assert.match(skill, /never a programming-language choice/);
  assert.match(skill, /never request, echo, copy, or rewrite raw Codex configuration/);
  assert.match(skill, /selection\.id/);
  assert.match(skill, /do not ask the same choice again/);
  assert.match(skill, /apply that exact choice as the user override/);
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
  assert.match(skill, /render_workspace_guide_configurator/);
  assert.match(skill, /submit_workspace_guide_configuration/);
  assert.match(skill, /configurator replaces separate profile and field questions/);
  assert.match(skill, /collaborationHost/);
  assert.match(skill, /Ask `\.github\/pull_request_template\.md` only when `collaborationHost` is `github`/);
  assert.match(skill, /Configure one applicable guide at a time/);
  assert.match(skill, /Pass `customChoices`, `guideDecisions`, and `workspaceSettings`/);
  assert.match(skill, /`agentsGuide` evidence and template preview/);
  assert.match(skill, /AGENTS_REPOSITORY_MAP/);
  assert.match(skill, /Do not let an answer weaken the Skill's approval gates/);
  assert.match(skill, /Do not ask for product features, user workflows, acceptance criteria, or implementation details/);
  assert.match(skill, /Do not create product-specific screens, API endpoints, business logic, database schemas, sample user flows, or feature tests/);
  assert.match(skill, /flutter create --no-pub --project-name <project_name> \./);
  assert.match(skill, /npx create-expo-app@latest \. --template default --no-agents-md --yes/);
  assert.match(skill, /The file-plan approval does not authorize this command/);
  assert.match(skill, /runtimeSetup\.artifactWritePhase/);
  assert.match(skill, /do not silently create `apps\/<name>`/);
  assert.match(skill, /auto-install lint configuration/);
  assert.match(skill, /baseline CI workflow/);
  assert.match(skill, /registry-backed audit/);
  assert.match(skill, /Do not launch `server\/dist\/index\.js`/);
  assert.match(skill, /Never create or rewrite `\.codex\/config\.toml`/);
  assert.match(skill, /marked `conflict`, `merge-preview`, or `deferred`/);
  assert.doesNotMatch(skill, /First working slice/);
});

test("workspace guide templates make their task-specific relationship explicit", () => {
  const templateRoot = path.join(HERE, "../../plugins/project-bootstrap/templates/common");
  const agents = fs.readFileSync(path.join(templateRoot, "AGENTS.md.tmpl"), "utf8");

  assert.equal(agents.trim(), "{{AGENTS_DOCUMENT}}");
  // Policy semantics and guide links are verified against the actual renderer
  // in agents-regressions.test.js, not against fixed template wording.
  for (const name of ["ARCHITECTURE.md.tmpl", "TEAM_GUIDE.md.tmpl", "PLANS.md.tmpl", "CODE_REVIEW.md.tmpl", "pull-request-template.md.tmpl"]) {
    assert.equal(fs.existsSync(path.join(templateRoot, name)), true, name);
  }
});

test("workspace guide templates and interview reference retain reviewed decisions", () => {
  const templateRoot = path.join(HERE, "../../plugins/project-bootstrap/templates/common");
  const decisionPlaceholders = [
    ["AGENTS.md.tmpl", "AGENTS_DOCUMENT"],
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
  assert.match(interview, /Workspace Guide Configurator/);
  assert.match(interview, /do not repeat these questions after a configurator submission/);
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

test("maintenance skill requires complete, evidence-backed policy audits without self-authorizing commands", () => {
  const maintenance = fs.readFileSync(
    path.join(HERE, "../../plugins/project-maintenance/skills/project-maintenance/SKILL.md"),
    "utf8"
  );
  const review = fs.readFileSync(
    path.join(HERE, "../../plugins/project-maintenance/skills/project-maintenance/references/implementation-review.md"),
    "utf8"
  );
  assert.match(maintenance, /policyAudit/);
  assert.match(maintenance, /Retrieve every page before reaching a conclusion/);
  assert.match(maintenance, /executedChecks/);
  assert.match(maintenance, /After explicit approval/);
  assert.match(review, /Full evidence policy audit/);
  assert.match(review, /nextPageToken/);
  assert.match(review, /never echo configuration values/);
  assert.match(review, /Do not substitute an overall score/);
});
