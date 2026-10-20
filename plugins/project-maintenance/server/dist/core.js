import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDE_POLICY_SCHEMA_VERSION, listGuidePolicies, normalizeGuideDecisions } from "./guide-policies.js";
import { createAgentGuideEvidence, isAgentMetadataPath } from "./agent-evidence.js";
import { createAgentsGuideBlueprint } from "./agents-guide.js";
import { listPlatformChoices } from "./platform-catalog.js";
import { validatePlatformSelection } from "./platform-selection.js";
import { createPlatformPlan } from "./platform-plan.js";

export { listGuidePolicies } from "./guide-policies.js";
export { createAgentGuideEvidence } from "./agent-evidence.js";
export { createAgentsGuideBlueprint } from "./agents-guide.js";
export { listPlatformChoices } from "./platform-catalog.js";
export { validatePlatformSelection } from "./platform-selection.js";
export { createPlatformPlan } from "./platform-plan.js";

export const PLUGIN_VERSION = "0.8.0";
export const CATALOG_EXPLORER_RESOURCE_URI = "ui://project-bootstrap/catalog-explorer-v2.html";
export const WORKSPACE_GUIDE_CONFIGURATOR_RESOURCE_URI = "ui://project-bootstrap/workspace-guide-configurator-v1.html";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target", "out", "bin", "obj", ".dart_tool", ".gradle", ".terraform",
  ".pytest_cache", ".mypy_cache", ".ruff_cache", "__pycache__", "venv",
  ".swiftpm", ".build", "Pods", ".expo"
]);

const TOOL_DEFINITIONS = [
  {
    name: "inspect_workspace",
    description: "Read a local workspace inventory plus a redacted summary of applicable Codex and project-tool preferences without changing files. Raw configuration values are never returned. Set the plugin's trusted workspace-root environment variable to restrict readable paths; otherwise the response reports that the host did not provide a boundary.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "Absolute or current-working-directory-relative workspace path." },
        maxDepth: { type: "integer", minimum: 1, maximum: 12, default: 5 },
        maxFiles: { type: "integer", minimum: 1, maximum: 2000, default: 300 }
      },
      required: ["root"],
      additionalProperties: false
    }
  },
  {
    name: "list_platform_choices",
    description: "List release-pinned, target-scoped platform choices with defaults, evidence, and recipe version baselines. Read-only; choices never authorize generation.",
    inputSchema: {
      type: "object",
      properties: {
        platformId: { type: "string", enum: ["web", "api", "android", "expo", "flutter", "ios", "desktop", "data"] },
        locale: { type: "string", enum: ["en", "ko"], default: "en" },
        requirements: { type: "object", description: "Optional productType (spa/fullstack), preferredLanguage, and persistentData values used only to rank the displayed defaults." }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "list_catalog",
    description: "List Markdown catalogue entries and localized labels packaged with the plugin. Call render_catalog_explorer to inspect a selected candidate set in an interactive UI.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", description: "Optional entry kind such as profile, architecture, runtime, delivery, or security." },
        tag: { type: "string", description: "Optional tag filter." },
        locale: { type: "string", enum: ["en", "ko"], default: "en" }
      },
      additionalProperties: false
    }
  },
  {
    name: "render_catalog_explorer",
    description: "Render selected Markdown catalogue candidates in the interactive Catalog Explorer. Call list_catalog or recommend first, then pass only the IDs currently being compared. This is read-only and a choice in the UI is never approval to write files or run commands.",
    inputSchema: {
      type: "object",
      properties: {
        candidateIds: { type: "array", minItems: 1, maxItems: 12, items: { type: "string" } },
        allowCustom: { type: "boolean", default: false, description: "Show a user-defined alternative for a single-kind technology comparison." },
        locale: { type: "string", enum: ["en", "ko"], default: "en" },
        title: { type: "string", maxLength: 120, description: "Optional context title for the comparison." }
      },
      required: ["candidateIds"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true },
    _meta: {
      ui: { resourceUri: CATALOG_EXPLORER_RESOURCE_URI },
      "openai/outputTemplate": CATALOG_EXPLORER_RESOURCE_URI,
      "openai/toolInvocation/invoking": "Opening Catalog Explorer…",
      "openai/toolInvocation/invoked": "Catalog Explorer ready."
    }
  },
  {
    name: "submit_catalog_selection",
    description: "Validate a Catalog Explorer choice and return structured planning input for the next interview step. This tool records no durable state, writes no files, and never approves commands.",
    inputSchema: {
      type: "object",
      properties: {
        candidateIds: { type: "array", minItems: 1, maxItems: 13, items: { type: "string" }, description: "Exactly the candidate IDs shown in the Explorer, including custom when offered." },
        selectedId: { type: "string", description: "The candidate ID chosen by the user." },
        comment: { type: "string", maxLength: 2000, default: "" },
        locale: { type: "string", enum: ["en", "ko"], default: "en" }
      },
      required: ["candidateIds", "selectedId"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true },
    _meta: {
      ui: { visibility: ["model", "app"] },
      "openai/toolInvocation/invoking": "Applying catalog selection…",
      "openai/toolInvocation/invoked": "Catalog selection ready."
    }
  },
  {
    name: "recommend",
    description: "Rank starting profiles using explicit requirements and a workspace inventory. Recommendations never select technologies automatically.",
    inputSchema: {
      type: "object",
      properties: {
        requirements: {
          type: "object",
          properties: {
            productType: { type: "string" },
            targetStage: { type: "string", enum: ["mockup", "mvp", "production"], description: "The current delivery target: an interactive mockup, an MVP for early users, or a production foundation." },
            teamSize: { type: "integer", minimum: 1 },
            budgetSensitivity: { type: "string", enum: ["low", "medium", "high"] },
            operationsPreference: { type: "string", enum: ["low", "balanced", "high-control"] },
            regulated: { type: "boolean" },
            expectedTraffic: { type: "string", enum: ["low", "medium", "high"] },
            preferredIds: { type: "array", items: { type: "string" } }
          },
          additionalProperties: false
        },
        inventory: { type: "object" },
        locale: { type: "string", enum: ["en", "ko"], default: "en" }
      },
      required: ["requirements"],
      additionalProperties: false
    }
  },
  {
    name: "validate_selection",
    description: "Evaluate legacy selectedIds or a version-2 target-scoped platform selection against requirements, incompatibilities, and warnings.",
    inputSchema: {
      type: "object",
      properties: {
        selection: { type: "object", description: "Version-2 selection: {version:2, targets:[{id, platformId, path, choices, useDefaults?, customChoices?}]}" },
        hostPlatform: { type: "string", enum: ["windows", "linux", "macos"], description: "Optional host override for a cross-platform planning preview." },
        selectedIds: { type: "array", minItems: 1, items: { type: "string" } },
        customChoices: { type: "array", maxItems: 12, items: { type: "object", properties: {
          category: { type: "string", enum: ["language", "database", "framework", "tool", "architecture", "library"] },
          name: { type: "string", minLength: 1, maxLength: 80 },
          purpose: { type: "string", minLength: 1, maxLength: 300 },
          scope: { type: "string", maxLength: 120 },
          replacesId: { type: "string" }
        }, required: ["category", "name", "purpose"], additionalProperties: false } },
        requirements: { type: "object" },
        inventory: { type: "object" },
        locale: { type: "string", enum: ["en", "ko"], default: "en" }
      },
      additionalProperties: false
    }
  },
  {
    name: "list_workspace_guide_policies",
    description: "List the versioned, read-only policy profiles and allowed fields for the planned workspace-guide bundle. Use these exact IDs when collecting guide decisions.",
    inputSchema: {
      type: "object",
      properties: {
        locale: { type: "string", enum: ["en", "ko"], default: "en" }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "render_workspace_guide_configurator",
    description: "Render one workspace-guide policy in an interactive editor. Users can select a profile, adjust its allowed fields, add a validated custom explanation, and add scoped AGENTS.md rules. This is planning input only and never writes files or runs commands.",
    inputSchema: {
      type: "object",
      properties: {
        guideKey: { type: "string", enum: ["agents", "architecture", "team", "plans", "codeReview", "pullRequest"] },
        decision: { type: "object", description: "Optional current decision draft for this guide only." },
        workspaceSettings: { type: "object", description: "Current reviewed workspace settings, used to determine whether the pull-request guide is applicable." },
        locale: { type: "string", enum: ["en", "ko"], default: "en" }
      },
      required: ["guideKey"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true },
    _meta: {
      ui: { resourceUri: WORKSPACE_GUIDE_CONFIGURATOR_RESOURCE_URI },
      "openai/outputTemplate": WORKSPACE_GUIDE_CONFIGURATOR_RESOURCE_URI,
      "openai/toolInvocation/invoking": "Opening workspace-guide configurator…",
      "openai/toolInvocation/invoked": "Workspace-guide configurator ready."
    }
  },
  {
    name: "submit_workspace_guide_configuration",
    description: "Validate one user-edited workspace-guide decision and return normalized planning input. The result records no durable state and never approves files, commands, or hosted-repository changes.",
    inputSchema: {
      type: "object",
      properties: {
        guideKey: { type: "string", enum: ["agents", "architecture", "team", "plans", "codeReview", "pullRequest"] },
        decision: { type: "object", description: "The selected profile, allowed fields, and optional structured additions for one guide." },
        workspaceSettings: { type: "object", description: "Current reviewed workspace settings. pullRequest requires collaborationHost: github." },
        locale: { type: "string", enum: ["en", "ko"], default: "en" }
      },
      required: ["guideKey", "decision"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true },
    _meta: {
      ui: { visibility: ["model", "app"] },
      "openai/toolInvocation/invoking": "Validating workspace-guide configuration…",
      "openai/toolInvocation/invoked": "Workspace-guide configuration is ready."
    }
  },
  {
    name: "create_plan",
    description: "Produce a read-only legacy bootstrap plan or version-2 target-scoped platform file and command plan. A blocked selection produces no writable plan.",
    inputSchema: {
      type: "object",
      properties: {
        selection: { type: "object", description: "Version-2 target-scoped selection. When present, selectedIds is not used." },
        selectedIds: { type: "array", minItems: 1, items: { type: "string" } },
        customChoices: { type: "array", maxItems: 12, items: { type: "object", properties: {
          category: { type: "string", enum: ["language", "database", "framework", "tool", "architecture", "library"] },
          name: { type: "string", minLength: 1, maxLength: 80 },
          purpose: { type: "string", minLength: 1, maxLength: 300 },
          scope: { type: "string", maxLength: 120 },
          replacesId: { type: "string" }
        }, required: ["category", "name", "purpose"], additionalProperties: false } },
        projectName: { type: "string", minLength: 1, maxLength: 80, description: "Name used by a supported runtime scaffold. New single-runtime projects are scaffolded at the workspace root." },
        requirements: { type: "object" },
        guideDecisions: {
          type: "object",
          description: "User-confirmed settings for AGENTS.md, ARCHITECTURE.md, TEAM_GUIDE.md, PLANS.md, CODE_REVIEW.md, and the pull-request template. This is planning data only and never authorizes writes.",
          properties: {
            agents: { type: "object" },
            architecture: { type: "object" },
            team: { type: "object" },
            plans: { type: "object" },
            codeReview: { type: "object" },
            pullRequest: { type: "object" }
          },
          additionalProperties: false
        },
        workspaceSettings: {
          type: "object",
          description: "Reviewed workspace-wide settings. GitHub-specific files are considered only when collaborationHost is github. Existing Codex configuration is preserved. A new Next.js monorepo needs an explicit applicationPath choice.",
          properties: {
            collaborationHost: { type: "string", enum: ["none", "github", "gitlab", "other", "existing"] },
            applicationPath: { type: "string", enum: [".", "apps/web"], description: "Explicit location for a new Next.js scaffold. Use apps/web only with repository.monorepo." },
            nodeVersion: { type: "string", enum: ["20", "22", "24"], description: "Reviewed Node.js major version for an active npm CI workflow." },
            containerPort: { type: "integer", minimum: 1, maximum: 65535, description: "Reviewed application port for a root Dockerfile; required before active Compose generation." }
          },
          additionalProperties: false
        },
        inventory: { type: "object" },
        locale: { type: "string", enum: ["en", "ko"], default: "en" }
      },
      additionalProperties: false
    }
  },
  {
    name: "assess_implementation",
    description: "Read a local implementation against caller-supplied acceptance criteria. Report file evidence, declared versus reported checks, documentation drift, and contextual review prompts without claiming that file presence proves behavior. Never runs commands or changes files.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "Local workspace to inspect under the configured host boundary." },
        requirements: {
          type: "array", maxItems: 30,
          items: {
            type: "object",
            properties: {
              id: { type: "string", minLength: 1, maxLength: 80 },
              description: { type: "string", minLength: 1, maxLength: 500 },
              evidencePaths: { type: "array", maxItems: 20, items: { type: "string" } },
              checkDirectory: { type: "string", description: "Workspace-relative directory for the listed check commands; defaults to the workspace root." },
              checkCommands: { type: "array", maxItems: 10, items: { type: "string" } }
            },
            required: ["id", "description"],
            additionalProperties: false
          }
        },
        reportedChecks: {
          type: "array", maxItems: 40,
          items: {
            type: "object",
            properties: {
              command: { type: "string" },
              directory: { type: "string", description: "Workspace-relative execution directory; defaults to the workspace root." },
              status: { type: "string", enum: ["passed", "failed", "unavailable"] },
              source: { type: "string", description: "Caller-supplied log or CI run reference; not independently verified by this tool." }
            },
            required: ["command", "status", "source"],
            additionalProperties: false
          }
        }
      },
      required: ["root"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "check_updates",
    description: "Compare an installed version with a version supplied by the marketplace host. This tool never contacts the network.",
    inputSchema: {
      type: "object",
      properties: {
        installedVersion: { type: "string", default: PLUGIN_VERSION },
        availableVersion: { type: "string" },
        releaseNotes: { type: "string" }
      },
      additionalProperties: false
    }
  }
];

export function getToolDefinitions() {
  return TOOL_DEFINITIONS;
}

export function parseFrontmatter(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { attributes: {}, body: normalized };

  const end = normalized.indexOf("\n---", 4);
  if (end === -1) throw new Error("Frontmatter is missing its closing delimiter.");

  const attributes = {};
  for (const line of normalized.slice(4, end).split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error(`Invalid frontmatter line: ${line}`);
    const key = line.slice(0, separator).trim();
    attributes[key] = parseFrontmatterValue(line.slice(separator + 1).trim());
  }

  return { attributes, body: normalized.slice(end + 4).replace(/^\n/, "") };
}

function parseFrontmatterValue(value) {
  if (value === "[]") return [];
  if (value.startsWith("[") && value.endsWith("]")) {
    const contents = value.slice(1, -1).trim();
    return contents ? contents.split(",").map((part) => unquote(part.trim())) : [];
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return unquote(value);
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function asList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function entryLabel(entry, locale = "en") {
  return entry.attributes[`title_${locale}`] || entry.attributes.title_en || entry.attributes.id;
}

function entrySummary(entry, locale = "en") {
  return entry.attributes[`summary_${locale}`] || entry.attributes.summary_en || "";
}

async function directoryExists(candidate) {
  try {
    return (await fs.stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

export async function resolveCatalogRoot() {
  const configured = process.env.PROJECT_BOOTSTRAP_CATALOG_ROOT;
  const candidates = [
    configured,
    path.resolve(HERE, "../../plugins/project-bootstrap/catalog"),
    path.resolve(HERE, "../../catalog")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await directoryExists(candidate)) return candidate;
  }
  throw new Error("Project Bootstrap catalogue could not be located.");
}

async function findMarkdownFiles(root) {
  const result = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && entry.name.endsWith(".md")) result.push(fullPath);
    }
  }
  await visit(root);
  return result.sort();
}

export async function loadCatalog() {
  const root = await resolveCatalogRoot();
  const entries = [];
  for (const file of await findMarkdownFiles(root)) {
    const markdown = await fs.readFile(file, "utf8");
    const parsed = parseFrontmatter(markdown);
    if (!parsed.attributes.id || !parsed.attributes.kind) continue;
    entries.push({
      file,
      relativePath: path.relative(root, file).replaceAll(path.sep, "/"),
      attributes: parsed.attributes,
      body: parsed.body,
      markdown
    });
  }

  const duplicateIds = entries
    .map((entry) => entry.attributes.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error(`Duplicate catalogue IDs: ${[...new Set(duplicateIds)].join(", ")}`);
  return entries;
}

export function listCatalog(entries, { kind, tag, locale = "en" } = {}) {
  return entries
    .filter((entry) => !kind || entry.attributes.kind === kind)
    .filter((entry) => !tag || asList(entry.attributes.tags).includes(tag))
    .map((entry) => ({
      id: entry.attributes.id,
      kind: entry.attributes.kind,
      label: entryLabel(entry, locale),
      summary: entrySummary(entry, locale),
      tags: asList(entry.attributes.tags),
      languages: asList(entry.attributes.languages),
      path: entry.relativePath
    }));
}

export function createCatalogExplorer(entries, { candidateIds, allowCustom = false, locale = "en", title } = {}) {
  const byId = new Map(entries.map((entry) => [entry.attributes.id, entry]));
  const ids = [...new Set(asList(candidateIds))];
  if (!ids.length) throw new Error("candidateIds must include at least one catalogue ID.");

  const selected = ids.map((id) => {
    const entry = byId.get(id);
    if (!entry) throw new Error(`Unknown catalogue ID: ${id}`);
    return {
      id,
      kind: entry.attributes.kind,
      label: entryLabel(entry, locale),
      summary: entrySummary(entry, locale),
      tags: asList(entry.attributes.tags),
      languages: asList(entry.attributes.languages),
      path: entry.relativePath,
      markdown: entry.markdown
    };
  });
  if (allowCustom) {
    const kinds = new Set(selected.map((entry) => entry.kind));
    if (kinds.size !== 1 || kinds.has("profile")) throw new Error("A custom alternative requires one non-profile catalogue kind.");
    const customLabel = selected[0].kind === "ui-architecture"
      ? (locale === "ko" ? "다른 아키텍처 직접 지정" : "Specify another architecture")
      : selected[0].kind === "state-management"
        ? (locale === "ko" ? "다른 상태관리 구현 직접 지정" : "Specify another state-management implementation")
        : (locale === "ko" ? "다른 기술 직접 지정" : "Specify another technology");
    selected.push({
      id: "custom", kind: selected[0].kind,
      label: customLabel,
      summary: locale === "ko" ? "기술 이름과 용도를 의견에 적으세요. 지원하지 않는 설정은 자동 생성되지 않습니다." : "Name the technology and purpose in the comment. Unsupported configuration is not generated automatically.",
      tags: ["user-defined"], languages: [], path: "",
      markdown: locale === "ko" ? "기술 이름, 사용 범위, 선택 이유를 적으세요. 이 선택은 계획에 기록되며 별도 구현·설정 검토가 필요합니다." : "Provide the technology name, scope, and reason. The plan records the choice; implementation and configuration need separate review."
    });
  }

  return {
    title: title || (locale === "ko" ? "카탈로그 후보 비교" : "Catalog candidate comparison"),
    locale,
    allowCustom,
    entries: selected,
    guidance: locale === "ko"
      ? "후보를 비교한 뒤 선택과 의견을 채팅에 제출하세요. 이는 파일 변경이나 명령 실행 승인과는 별개입니다."
      : "Compare candidates, then submit a selection and comment to chat. This is separate from approval for file changes or command execution."
  };
}

export function submitCatalogSelection(entries, { candidateIds, selectedId, comment = "", locale = "en" } = {}) {
  const byId = new Map(entries.map((entry) => [entry.attributes.id, entry]));
  const shownIds = [...new Set(asList(candidateIds))];
  if (!shownIds.length) throw new Error("candidateIds must include at least one catalogue ID.");
  if (!shownIds.includes(selectedId)) throw new Error("selectedId must be one of the candidateIds shown in the Catalog Explorer.");

  const normalizedComment = typeof comment === "string" ? comment.trim() : "";
  if (normalizedComment.length > 2000) throw new Error("comment must be 2000 characters or fewer.");
  if (selectedId === "custom") {
    const ordinary = shownIds.filter((id) => id !== "custom").map((id) => byId.get(id));
    if (ordinary.length === 0 || ordinary.some((entry) => !entry) || new Set(ordinary.map((entry) => entry.attributes.kind)).size !== 1) {
      throw new Error("A custom selection requires shown candidates from one catalogue kind.");
    }
    if (!normalizedComment) throw new Error("A custom selection requires the technology name and purpose in its comment.");
    return {
      status: "accepted", source: "project-bootstrap.catalog-explorer", locale, candidateIds: shownIds,
      selection: { id: "custom", kind: ordinary[0].attributes.kind, label: locale === "ko" ? "사용자 지정 선택" : "Custom choice", comment: normalizedComment, custom: true, suggestedIds: [] },
      continuation: { replaceOnlyCurrentDecision: true, message: "Collect the exact technology name, purpose, and scope. Record it in customChoices; do not add an unsupported catalogue ID or infer a scaffold/configuration." },
      safeguards: ["This is planning input only; it does not write files or run commands.", "Unsupported technology configuration requires a separate review and approval."]
    };
  }
  const selected = byId.get(selectedId);
  if (!selected) throw new Error(`Unknown catalogue ID: ${selectedId}`);

  return {
    status: "accepted",
    source: "project-bootstrap.catalog-explorer",
    locale,
    candidateIds: shownIds,
    selection: {
      id: selectedId,
      kind: selected.attributes.kind,
      label: entryLabel(selected, locale),
      comment: normalizedComment,
      suggestedIds: asList(selected.attributes.suggests)
    },
    continuation: {
      replaceOnlyCurrentDecision: true,
      message: "Treat this as the user's answer for the current catalogue decision. Keep earlier choices from other decisions, do not ask this choice again, then validate the accumulated selection or present the next relevant candidates."
    },
    safeguards: [
      "This is planning input only; it does not write files or run commands.",
      "This tool stores no selection outside the current conversation context."
    ]
  };
}

function guidePolicyFor(guideKey, locale) {
  const guide = listGuidePolicies({ locale }).find((candidate) => candidate.key === guideKey);
  if (!guide) throw new Error("Unknown workspace guide.");
  return guide;
}

function guideConfiguratorDraft(guide, decision = {}) {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    throw new Error("Guide configurator decision must be an object.");
  }
  const profileId = decision.profile ?? guide.profiles[0]?.id;
  const profile = guide.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error(`Invalid ${guide.key}.profile guide policy value.`);

  const permitted = new Set([
    "profile",
    "comment",
    ...Object.keys(guide.fields),
    ...(guide.key === "agents" ? ["projectContext", "rules", "reviewedCommands"] : [])
  ]);
  for (const key of Object.keys(decision)) {
    if (!permitted.has(key)) throw new Error(`Unknown ${guide.key} guide decision field: ${key}.`);
  }

  const draft = { profile: profileId, ...profile.defaults };
  for (const [field, allowedValues] of Object.entries(guide.fields)) {
    if (decision[field] === undefined) continue;
    if (typeof decision[field] !== "string" || !allowedValues.includes(decision[field])) {
      throw new Error(`Invalid ${guide.key}.${field} guide policy value.`);
    }
    draft[field] = decision[field];
  }
  for (const field of ["comment", "projectContext", "rules", "reviewedCommands"]) {
    if (decision[field] !== undefined) draft[field] = decision[field];
  }
  return draft;
}

export function createWorkspaceGuideConfigurator({ guideKey, decision = {}, workspaceSettings = {}, locale = "en" } = {}) {
  const normalizedWorkspaceSettings = normalizeWorkspaceSettings(workspaceSettings);
  const guide = guidePolicyFor(guideKey, locale);
  if (guideKey === "pullRequest" && normalizedWorkspaceSettings.collaborationHost !== "github") {
    throw new Error("pullRequest configuration requires workspaceSettings.collaborationHost: github.");
  }
  const draft = guideConfiguratorDraft(guide, decision);
  const isKorean = locale === "ko";
  return {
    title: isKorean ? `${guide.title} 설정` : `${guide.title} configuration`,
    locale,
    guide,
    draft,
    workspaceSettings: normalizedWorkspaceSettings,
    guidance: isKorean
      ? "프로필과 세부 정책을 검토한 뒤 제출하세요. 사용자 정의 선택에는 적용 범위, 지킬 규칙, 안전한 대안을 설명하세요. 이 설정은 계획 입력일 뿐 파일 변경이나 명령 실행을 승인하지 않습니다."
      : "Review the profile and detailed policies before submitting. For a custom choice, explain the scope, convention or invariant, and safe alternative. This configuration is planning input only; it does not approve file changes or commands.",
    safeguards: [
      "This UI validates only one guide decision at a time.",
      "The submitted configuration is not persisted outside the current planning conversation.",
      "Existing .codex/config.toml files are preserved and cannot be edited by this UI."
    ]
  };
}

export function submitWorkspaceGuideConfiguration({ guideKey, decision, workspaceSettings = {}, locale = "en" } = {}) {
  guidePolicyFor(guideKey, locale);
  const normalizedWorkspaceSettings = normalizeWorkspaceSettings(workspaceSettings);
  const guideDecisions = normalizeGuideDecisions({ [guideKey]: decision }, {
    allowPullRequest: normalizedWorkspaceSettings.collaborationHost === "github"
  });
  const normalizedDecision = guideDecisions[guideKey];
  return {
    status: "accepted",
    source: "project-bootstrap.workspace-guide-configurator",
    locale,
    guideKey,
    guideDecisions,
    workspaceSettings: normalizedWorkspaceSettings,
    continuation: {
      replaceOnlyCurrentGuideDecision: true,
      message: "Treat this as the user's answer for the current workspace-guide decision. Keep earlier guide decisions, do not ask this guide again, then continue the applicable interview or create a read-only plan after all required decisions are confirmed."
    },
    configurationSummary: normalizedDecision,
    safeguards: [
      "This is planning input only; it does not write files, run commands, or change hosted repository settings.",
      "Custom rules and reviewed commands are validated before they are returned.",
      "Existing .codex/config.toml files remain outside this configuration flow."
    ]
  };
}

function isWithin(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveWorkspaceRoot(root) {
  if (typeof root !== "string" || !root.trim()) throw new Error("root is required.");
  const resolved = path.resolve(root);
  const allowedRoot = process.env.PROJECT_BOOTSTRAP_ALLOWED_ROOT || process.env.PROJECT_MAINTENANCE_ALLOWED_ROOT;
  if (allowedRoot && !isWithin(resolved, path.resolve(allowedRoot))) {
    throw new Error("The workspace path is outside the configured project workspace boundary.");
  }
  return resolved;
}

function workspaceAccessScope() {
  const allowedRoot = (process.env.PROJECT_BOOTSTRAP_ALLOWED_ROOT || process.env.PROJECT_MAINTENANCE_ALLOWED_ROOT)?.trim();
  return allowedRoot
    ? { mode: "restricted", allowedRoot: path.resolve(allowedRoot) }
    : {
        mode: "host-boundary-not-configured",
        message: "Set the plugin's trusted workspace-root environment variable to restrict inspection paths."
      };
}

const PULL_REQUEST_TEMPLATE_PATHS = new Set([
  "pull_request_template.md",
  "docs/pull_request_template.md",
  ".github/pull_request_template.md"
]);

function configurationInventory(files) {
  const normalized = asList(files);
  const pullRequestTemplates = normalized.filter((file) =>
    PULL_REQUEST_TEMPLATE_PATHS.has(file) || file.startsWith(".github/PULL_REQUEST_TEMPLATE/")
  );
  return {
    rootAgents: normalized.filter((file) => file === "AGENTS.md" || file === "AGENTS.override.md"),
    nestedAgents: normalized.filter((file) => /.+\/(?:AGENTS|AGENTS\.override)\.md$/.test(file)),
    codexConfigs: normalized.filter((file) => /(?:^|\/)\.codex\/config\.toml$/.test(file)),
    pullRequestTemplates,
    codeowners: normalized.filter((file) => ["CODEOWNERS", "docs/CODEOWNERS", ".github/CODEOWNERS"].includes(file)),
    contributorGuides: normalized.filter((file) => ["CONTRIBUTING.md", "docs/CONTRIBUTING.md"].includes(file))
  };
}



function parseTomlScalar(value) {
  const withoutComment = value.replace(/\s+#.*$/, "").trim();
  if ((withoutComment.startsWith('"') && withoutComment.endsWith('"')) || (withoutComment.startsWith("'") && withoutComment.endsWith("'"))) {
    return withoutComment.slice(1, -1);
  }
  return withoutComment;
}


export function parseProjectBootstrapConfig(toml) {
  const settings = {};
  let inProjectBootstrapTable = false;

  for (const line of String(toml || "").replace(/\r\n/g, "\n").split("\n")) {
    const table = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (table) {
      inProjectBootstrapTable = table[1].trim() === "project_bootstrap" || table[1].trim() === "project-bootstrap";
      continue;
    }
    if (!inProjectBootstrapTable) continue;

    const setting = line.match(/^\s*(language|locale)\s*=\s*(.+?)\s*$/);
    if (!setting) continue;
    const key = setting[1];
    const value = parseTomlScalar(setting[2]);
    if (key === "locale" && ["en", "ko"].includes(value)) settings.locale = value;
    if (key === "language" && settings.locale === undefined && ["en", "ko"].includes(value)) settings.locale = value;
  }

  return settings;
}

async function inspectCodexConfigFile(file, source) {
  try {
    const content = await fs.readFile(file, "utf8");
    return {
      source,
      path: file,
      exists: true,
      projectBootstrap: parseProjectBootstrapConfig(content.slice(0, 128_000))
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { source, path: file, exists: false, projectBootstrap: {} };
    return { source, path: file, exists: false, unreadable: true, projectBootstrap: {} };
  }
}

function effectiveBootstrapSetting(project, user, key) {
  if (project.projectBootstrap[key] !== undefined) return { value: project.projectBootstrap[key], source: "project" };
  if (user.projectBootstrap[key] !== undefined) return { value: user.projectBootstrap[key], source: "user" };
  return undefined;
}

function defaultUserCodexConfigPath() {
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  return path.join(codexHome, "config.toml");
}

export async function inspectCodexSettings(workspace, { globalConfigPath, localConfigPath } = {}) {
  const user = await inspectCodexConfigFile(globalConfigPath || defaultUserCodexConfigPath(), "user");
  const project = await inspectCodexConfigFile(localConfigPath || path.join(workspace, ".codex", "config.toml"), "project");
  return {
    user,
    project,
    effective: {
      locale: effectiveBootstrapSetting(project, user, "locale")
    },
    precedence: "legacy-project-bootstrap-table: project-over-user",
    note: "Only the legacy [project_bootstrap] locale is inspected. Native Codex settings are preserved and not interpreted by this plugin."
  };
}

export function determineProgrammingLanguageDecision(languages) {
  const detectedLanguages = [...new Set(asList(languages))];
  if (detectedLanguages.length) {
    return {
      action: "preserve-detected",
      detectedLanguages,
      message: "Detected workspace programming languages are preserved as planning constraints."
    };
  }
  return {
    action: "defer-to-profile",
    detectedLanguages,
    message: "No programming language was detected; determine it later from the selected project profile and catalogue options."
  };
}

export function determineResponseLocaleDecision(codexSettings = {}) {
  const configuredLocale = codexSettings.effective?.locale;
  if (configuredLocale) {
    return {
      action: "apply-codex-setting",
      locale: configuredLocale.value,
      source: configuredLocale.source,
      message: "Use the effective Codex response locale without asking again."
    };
  }
  return {
    action: "ask-user",
    supportedLocales: ["ko", "en"],
    message: "No response locale was found; ask which language to use for the guided questions and answers."
  };
}

export async function inspectWorkspace({ root, maxDepth = 5, maxFiles = 300, globalCodexConfigPath, localCodexConfigPath }) {
  const workspace = resolveWorkspaceRoot(root);
  const files = [];
  const skippedDirectories = [];
  const truncated = { value: false };

  async function visit(directory, depth) {
    if (depth > maxDepth || files.length >= maxFiles) { truncated.value = true; return; }
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (files.length >= maxFiles) { truncated.value = true; return; }
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(directory, entry.name);
      const relative = path.relative(workspace, fullPath).replaceAll(path.sep, "/");
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) skippedDirectories.push(relative + "/");
        else await visit(fullPath, depth + 1);
      } else if (entry.isFile()) files.push(relative);
    }
  }
  try { await visit(workspace, 0); } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`Workspace does not exist: ${workspace}`);
    throw error;
  }

  // Every skipped/truncated metadata read is exposed separately from directory
  // traversal completeness. No silent first-100-manifest cap.
  const metadataPaths = files.filter(isAgentMetadataPath);
  const collection = { complete: true, readCount: 0, total: metadataPaths.length, skipped: [], maxFileBytes: 128_000, maxTotalBytes: 4_000_000 };
  const manifests = [];
  let collectedBytes = 0;
  for (const file of metadataPaths) {
    if (collectedBytes >= collection.maxTotalBytes) {
      collection.skipped.push({ path: file, reason: "metadata-total-limit" });
      continue;
    }
    try {
      const size = (await fs.stat(path.join(workspace, file))).size;
      if (size > collection.maxFileBytes || collectedBytes + size > collection.maxTotalBytes) {
        collection.skipped.push({ path: file, reason: "metadata-size-limit" });
        continue;
      }
      const content = await fs.readFile(path.join(workspace, file), "utf8");
      const bytes = Buffer.byteLength(content);
      if (bytes > collection.maxFileBytes || collectedBytes + bytes > collection.maxTotalBytes) {
        collection.skipped.push({ path: file, reason: "metadata-size-limit" });
        continue;
      }
      manifests.push({ path: file, content });
      collectedBytes += bytes;
      collection.readCount += 1;
    } catch { collection.skipped.push({ path: file, reason: "metadata-unreadable" }); }
  }
  collection.complete = collection.skipped.length === 0;
  collection.bytesRead = collectedBytes;
  const fileSet = new Set(files);
  const agentGuideEvidence = createAgentGuideEvidence(files, { manifests, skippedDirectories, collection });
  const languages = agentGuideEvidence.languages;
  const codexSettings = await inspectCodexSettings(workspace, { globalConfigPath: globalCodexConfigPath, localConfigPath: localCodexConfigPath });
  const areas = agentGuideEvidence.verification.areas;
  const hasRuntime = (runtime) => areas.some((area) => area.runtime === runtime);
  return {
    root: workspace, accessScope: workspaceAccessScope(), state: files.length === 0 ? "new" : "existing",
    files, fileCount: files.length, truncated: truncated.value, skippedDirectories, languages, codexSettings,
    programmingLanguageDecision: determineProgrammingLanguageDecision(languages),
    responseLocaleDecision: determineResponseLocaleDecision(codexSettings),
    manifests: {
      packageJson: hasRuntime("node"), pyproject: files.some((file) => path.posix.basename(file) === "pyproject.toml"),
      goMod: hasRuntime("go"), maven: hasRuntime("maven"), gradle: hasRuntime("gradle"), dotnet: hasRuntime("dotnet"),
      flutter: hasRuntime("flutter"), dart: hasRuntime("dart"), rust: hasRuntime("rust"), swift: hasRuntime("swift"), terraform: hasRuntime("terraform")
    },
    existingBootstrapArtifacts: ["AGENTS.md", ".codex/config.toml", ".project-bootstrap/selection.yaml", "docs/project-bootstrap/decision-record.md"].filter((artifact) => fileSet.has(artifact)),
    configuration: configurationInventory(files), agentGuideEvidence,
    detected: {
      docker: fileSet.has("Dockerfile") || fileSet.has("docker-compose.yml") || fileSet.has("compose.yaml"),
      githubActions: files.some((file) => file.startsWith(".github/workflows/")),
      kubernetes: files.some((file) => file.startsWith("k8s/") || file.startsWith("kubernetes/")),
      terraform: hasRuntime("terraform")
    }
  };
}

function profileScore(profile, requirements = {}, inventory = {}) {
  const tags = asList(profile.attributes.tags);
  const languages = asList(profile.attributes.languages);
  let score = Number(profile.attributes.base_score || 50);
  const reasons = [{ kind: "baseline", points: score, detail: "Profile baseline" }];

  if (requirements.productType && tags.includes(requirements.productType)) {
    score += 35;
    reasons.push({ kind: "product-type", points: 35, detail: `Matches ${requirements.productType}` });
  }
  const stages = asList(profile.attributes.stages);
  if (requirements.targetStage && stages.includes(requirements.targetStage)) {
    score += 25;
    reasons.push({ kind: "target-stage", points: 25, detail: `Matches ${requirements.targetStage} target` });
  }
  if (requirements.operationsPreference === "low" && tags.includes("low-ops")) {
    score += 15;
    reasons.push({ kind: "operations", points: 15, detail: "Low-operations preference" });
  }
  if (requirements.expectedTraffic === "high" && tags.includes("high-scale")) {
    score += 15;
    reasons.push({ kind: "traffic", points: 15, detail: "High-scale profile" });
  }
  if (requirements.teamSize && requirements.teamSize <= 3 && tags.includes("small-team")) {
    score += 10;
    reasons.push({ kind: "team", points: 10, detail: "Small-team fit" });
  }
  if (requirements.regulated && tags.includes("regulated")) {
    score += 15;
    reasons.push({ kind: "regulation", points: 15, detail: "Regulated-workload fit" });
  }
  const existingLanguages = asList(inventory.languages);
  const overlap = languages.filter((language) => existingLanguages.includes(language));
  if (overlap.length) {
    const points = overlap.length * 8;
    score += points;
    reasons.push({ kind: "existing-stack", points, detail: `Preserves ${overlap.join(", ")}` });
  }
  const preferred = asList(requirements.preferredIds);
  if (preferred.includes(profile.attributes.id)) {
    score += 20;
    reasons.push({ kind: "explicit-preference", points: 20, detail: "Explicitly preferred" });
  }
  return { score, reasons };
}

export function recommend(entries, { requirements = {}, inventory = {}, locale = "en" } = {}) {
  return entries
    .filter((entry) => entry.attributes.kind === "profile")
    .map((profile) => {
      const result = profileScore(profile, requirements, inventory);
      return {
        id: profile.attributes.id,
        label: entryLabel(profile, locale),
        summary: entrySummary(profile, locale),
        score: result.score,
        reasons: result.reasons,
        suggestedIds: asList(profile.attributes.suggests),
        template: {
          ids: asList(profile.attributes.suggests),
          policy: "common-starting-point",
          message: locale === "ko"
            ? "보편적인 시작 조합입니다. 각 기술은 확정 전에 변경하거나 사용자 지정할 수 있습니다."
            : "A common starting combination. Review, replace, or customize each technology before confirming."
        }
      };
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function statusSummary(messages) {
  if (messages.some((message) => message.status === "block")) return "block";
  if (messages.some((message) => message.status === "warning")) return "warning";
  return "pass";
}

function normalizeCustomChoices(value) {
  if (!Array.isArray(value) || value.length > 12) throw new Error("customChoices must be an array of at most 12 choices.");
  const seen = new Set();
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some((key) => !["category", "name", "purpose", "scope", "replacesId"].includes(key))) {
      throw new Error("Invalid customChoices entry.");
    }
    const { category } = item;
    if (!["language", "database", "framework", "tool", "architecture", "library"].includes(category)) throw new Error("Invalid custom choice category.");
    const field = (key, limit, required) => {
      const value = item[key];
      if ((value === undefined || value === "") && !required) return undefined;
      if (typeof value !== "string" || !value.trim() || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`Invalid custom choice ${key}.`);
      return value.trim();
    };
    const name = field("name", 80, true);
    const purpose = field("purpose", 300, true);
    const scope = field("scope", 120, false);
    const replacesId = field("replacesId", 120, false);
    if (["architecture", "library"].includes(category) && !scope) throw new Error(`Custom ${category} choices require a scope.`);
    const key = `${category}\0${name.toLowerCase()}\0${(scope || "").toLowerCase()}`;
    if (seen.has(key)) throw new Error("Duplicate custom choice.");
    seen.add(key);
    return { category, name, purpose, ...(scope ? { scope } : {}), ...(replacesId ? { replacesId } : {}) };
  });
}

export function validateSelection(entries, { selectedIds, customChoices = [], requirements = {}, inventory = {}, locale = "en" } = {}) {
  if (arguments[1]?.selection !== undefined) {
    if (selectedIds !== undefined) throw new Error("Use either selection or selectedIds, not both.");
    return validatePlatformSelection(arguments[1].selection, { inventory, requirements, hostPlatform: arguments[1].hostPlatform });
  }
  if (selectedIds === undefined) throw new Error("Provide selectedIds or selection.");
  const byId = new Map(entries.map((entry) => [entry.attributes.id, entry]));
  const selected = [...new Set(asList(selectedIds))];
  const selectedSet = new Set(selected);
  const reviewedCustomChoices = normalizeCustomChoices(customChoices);
  const messages = [];

  for (const choice of reviewedCustomChoices) {
    if (choice.replacesId && !byId.has(choice.replacesId)) {
      messages.push({ status: "block", code: "unknown-replaced-id", id: choice.replacesId, message: `Unknown replaced catalogue ID: ${choice.replacesId}` });
    } else if (choice.replacesId && selectedSet.has(choice.replacesId)) {
      messages.push({ status: "block", code: "custom-and-template-conflict", id: choice.replacesId, message: `Remove ${choice.replacesId} from selectedIds when replacing it with ${choice.name}.` });
    }
    messages.push({ status: "warning", code: "custom-technology-review", category: choice.category, name: choice.name,
      message: `${choice.name} is a user-defined ${choice.category} choice. Record its purpose and scope; do not generate unsupported setup or claim catalogue compatibility.` });
    const overlapping = choice.category === "language" ? selected.filter((id) => id.startsWith("language."))
      : choice.category === "database" ? selected.filter((id) => asList(byId.get(id)?.attributes.tags).includes("primary-database")) : [];
    if (overlapping.length && !choice.replacesId && !choice.scope) {
      messages.push({ status: "block", code: "custom-overlap-review", category: choice.category, relatedIds: overlapping,
        message: `Clarify whether ${choice.name} replaces or coexists with ${overlapping.join(", ")}, and record each role.` });
    }
  }

  const primaryDatabases = selected.filter((id) => asList(byId.get(id)?.attributes.tags).includes("primary-database"));
  if (primaryDatabases.length > 1) {
    messages.push({ status: "warning", code: "multiple-primary-databases", relatedIds: primaryDatabases,
      message: "Multiple primary databases were selected. Record each database's role, migration ownership, and backup boundary before implementation." });
  }

  if (selectedSet.has("mobile.android-native")) {
    const appliesToAndroid = (choice) => /android/i.test(choice.scope || "") || choice.replacesId?.startsWith("android.");
    const hasUiArchitecture = selected.some((id) => byId.get(id)?.attributes.kind === "ui-architecture")
      || reviewedCustomChoices.some((choice) => choice.category === "architecture" && appliesToAndroid(choice));
    const hasStateManagement = selected.some((id) => byId.get(id)?.attributes.kind === "state-management")
      || reviewedCustomChoices.some((choice) => choice.category === "library" && appliesToAndroid(choice));
    if (!hasUiArchitecture) messages.push({ status: "warning", code: "android-ui-architecture-undecided", id: "mobile.android-native",
      message: "Choose an Android UI architecture (for example MVVM or MVI) or record a scoped custom architecture before implementation." });
    if (!hasStateManagement) messages.push({ status: "warning", code: "android-state-management-undecided", id: "mobile.android-native",
      message: "Choose an Android state-management implementation or record a scoped custom library before implementation." });
  }

  for (const id of selected) {
    const entry = byId.get(id);
    if (!entry) {
      messages.push({ status: "block", code: "unknown-id", id, message: `Unknown catalogue ID: ${id}` });
      continue;
    }
    for (const dependency of asList(entry.attributes.requires)) {
      if (!selectedSet.has(dependency)) {
        messages.push({
          status: "block",
          code: "missing-requirement",
          id,
          relatedId: dependency,
          message: `${entryLabel(entry, locale)} requires ${dependency}.`
        });
      }
    }
    const alternatives = asList(entry.attributes.requires_any);
    if (alternatives.length && !alternatives.some((candidate) => selectedSet.has(candidate))) {
      messages.push({
        status: "block",
        code: "missing-alternative-requirement",
        id,
        relatedIds: alternatives,
        message: `${entryLabel(entry, locale)} requires one of: ${alternatives.join(", ")}.`
      });
    }
    for (const conflict of asList(entry.attributes.conflicts)) {
      if (selectedSet.has(conflict)) {
        messages.push({
          status: "block",
          code: "conflict",
          id,
          relatedId: conflict,
          message: `${entryLabel(entry, locale)} conflicts with ${conflict}.`
        });
      }
    }
    for (const warning of asList(entry.attributes.warns_with)) {
      if (selectedSet.has(warning)) {
        messages.push({
          status: "warning",
          code: "combination-warning",
          id,
          relatedId: warning,
          message: `${entryLabel(entry, locale)} needs explicit review with ${warning}.`
        });
      }
    }
  }

  if (requirements.teamSize && requirements.teamSize <= 3 && selectedSet.has("architecture.microservices")) {
    messages.push({
      status: "warning",
      code: "small-team-microservices",
      id: "architecture.microservices",
      message: "Microservices add operational overhead for a small team. Confirm ownership and observability before continuing."
    });
  }
  if (requirements.regulated && !selectedSet.has("security.oidc")) {
    messages.push({
      status: "block",
      code: "regulated-authentication",
      id: "security.oidc",
      message: "Regulated workloads require an explicit OIDC authentication decision."
    });
  }
  if (inventory.state === "existing" && selectedSet.has("delivery.github-actions") && inventory.detected?.githubActions) {
    messages.push({
      status: "warning",
      code: "existing-ci",
      id: "delivery.github-actions",
      message: "The workspace already contains GitHub Actions. Review existing workflows rather than overwriting them."
    });
  }

  const selectedLanguages = selected.filter((id) => id.startsWith("language.")).map((id) => id.slice("language.".length));
  const existingLanguages = asList(inventory.languages);
  for (const choice of reviewedCustomChoices.filter((item) => item.category === "language")) {
    if (inventory.state === "existing" && existingLanguages.length && !existingLanguages.includes(choice.name.toLowerCase()) && requirements.runtimeChangeApproved !== true) {
      messages.push({ status: "warning", code: "custom-existing-runtime-review", name: choice.name, existingLanguages,
        message: `The workspace already uses ${existingLanguages.join(", ")}; preserve it until adding or migrating to ${choice.name} is explicitly reviewed.` });
    }
  }
  if (inventory.state === "existing" && selectedLanguages.length && requirements.runtimeChangeApproved !== true) {
    const omitted = existingLanguages.filter((language) => {
      if (selectedLanguages.includes(language)) return false;
      if (language === "javascript" && selectedLanguages.includes("typescript")) return false;
      if (language === "jvm" && selectedLanguages.some((entry) => ["java", "kotlin"].includes(entry))) return false;
      if (existingLanguages.includes("flutter") && selectedLanguages.includes("flutter") && ["java", "kotlin", "swift"].includes(language)) return false;
      return true;
    });
    if (omitted.length) messages.push({ status: "warning", code: "existing-runtime-review", existingLanguages: omitted,
      message: `The workspace already uses ${omitted.join(", ")}. Preserve those runtimes; explicitly review an additional-runtime or migration decision before changing their setup.` });
  }
  if (!messages.length) messages.push({ status: "pass", code: "validated", message: "The selected catalogue rules passed." });
  return { status: statusSummary(messages), selectedIds: selected, customChoices: reviewedCustomChoices, messages };
}

const COMMON_ARTIFACTS = [
  [".project-bootstrap/selection.yaml", "decision-record"],
  ["docs/project-bootstrap/decision-record.md", "decision-record"],
  ["docs/project-bootstrap/validation-report.md", "validation-report"],
  ["docs/project-bootstrap/execution-plan.md", "execution-plan"],
  ["ARCHITECTURE.md", "architecture-guide"],
  ["docs/architecture/overview.md", "architecture-overview"],
  ["AGENTS.md", "codex-instructions"],
  ["TEAM_GUIDE.md", "team-guide"],
  ["PLANS.md", "planning-guide"],
  ["CODE_REVIEW.md", "code-review-guide"],
  [".env.example", "environment-contract"]
];

const DELIVERY_ARTIFACTS = {
  "delivery.docker-compose": [["docker-compose.yml", "local-container-orchestration"]],
  "delivery.github-actions": [[".github/workflows/ci.yml", "ci-workflow"]]
};

function deliveryReadiness(id, inventory, selectedIds, settings, customChoices = []) {
  const files = new Set(asList(inventory.files));
  if (id === "delivery.github-actions") {
    const commands = asList(inventory.agentGuideEvidence?.verification?.commands)
      .filter((item) => item.directory === "." && item.runtime === "node" && item.suitableForVerification)
      .map((item) => item.command)
      .filter((command) => /^npm run (?:test|lint|typecheck|build)$/.test(command));
    const checks = [...new Set(commands)].sort();
    if (!files.has("package.json") || !files.has("package-lock.json") || !checks.includes("npm run test") || !checks.includes("npm run build") || !settings.nodeVersion) {
      return { ready: false, reason: "Active CI needs a root npm manifest and lockfile with declared test and build scripts, plus a reviewed Node.js version. Re-inspect after runtime setup." };
    }
    return {
      ready: true,
      content: [
        "name: CI", "",
        "on:", "  pull_request:", "  push:", "    branches: [main]", "",
        "jobs:", "  verify:", "    runs-on: ubuntu-latest", "    steps:",
        "      - uses: actions/checkout@v4",
        "      - uses: actions/setup-node@v4",
        "        with:", `          node-version: ${settings.nodeVersion}`, "          cache: npm",
        "      - run: npm ci",
        ...checks.map((command) => `      - run: ${command}`),
        ""
      ].join("\n")
    };
  }
  if (id === "delivery.docker-compose") {
    if (selectedIds.some((id) => ["data.postgresql", "data.mysql", "data.sqlite", "data.redis"].includes(id))
      || customChoices.some((choice) => choice.category === "database")) {
      return { ready: false, reason: "The selected data technology needs a separately reviewed local persistence or service design before Compose can be activated." };
    }
    if (!files.has("Dockerfile") || !files.has(".env.example") || !settings.containerPort) {
      return { ready: false, reason: "Active Compose needs a root Dockerfile, an environment example, and a reviewed containerPort." };
    }
    return {
      ready: true,
      content: [
        "services:", "  app:", "    build: .",
        "    ports:", `      - "${settings.containerPort}:${settings.containerPort}"`, ""
      ].join("\n")
    };
  }
  return { ready: false, reason: "No active delivery renderer is available." };
}

const ADAPTER_ARTIFACTS = {
  "language.typescript": [["tsconfig.json", "typescript-compiler-config"], ["docs/architecture/interfaces/typescript.md", "typescript-interface-contract"]],
  "language.python": [["pyproject.toml", "python-project-config"], ["docs/architecture/interfaces/python.md", "python-interface-contract"]],
  "language.java": [["build.gradle.kts", "java-build-config"], ["docs/architecture/interfaces/jvm.md", "jvm-interface-contract"]],
  "language.kotlin": [["build.gradle.kts", "kotlin-build-config"], ["docs/architecture/interfaces/jvm.md", "jvm-interface-contract"]],
  "language.go": [["go.mod", "go-module-config"], ["docs/architecture/interfaces/go.md", "go-interface-contract"]],
  "language.dotnet": [["Directory.Build.props", "dotnet-build-config"], ["docs/architecture/interfaces/dotnet.md", "dotnet-interface-contract"]],
  "language.flutter": [["docs/architecture/interfaces/flutter.md", "flutter-interface-contract"]]
};

function plannedAdapterArtifacts(selectedIds, inventory = {}) {
  const selected = new Set(selectedIds);
  const runtimeOwnsTypeScriptConfig = selected.has("mobile.expo") || selected.has("frontend.nextjs");
  const artifacts = [];
  for (const id of selected) {
    for (const [file, template] of ADAPTER_ARTIFACTS[id] || []) {
      // A generic JVM Gradle build and service interface are not an Android
      // application scaffold. Preserve Android's own build and module layout.
      if (selected.has("mobile.android-native") && id === "language.kotlin") continue;
      // create-expo-app owns the generated tsconfig and its Expo base extension.
      // Writing a generic root configuration first makes a later root scaffold fail
      // or leaves two conflicting TypeScript baselines.
      if (runtimeOwnsTypeScriptConfig && file === "tsconfig.json") continue;
      // Existing Maven/Groovy builds own their configuration; selecting a JVM
      // language does not select a replacement build system.
      if (file === "build.gradle.kts" && asList(inventory.files).some((entry) => /(^|\/)(pom\.xml|build\.gradle)$/.test(entry))) continue;
      artifacts.push([file, template]);
    }
  }
  return artifacts;
}

const FLUTTER_STANDARD_PATHS = [
  "pubspec.yaml",
  "analysis_options.yaml",
  "lib/main.dart",
  "test/widget_test.dart",
  "android/",
  "ios/",
  "web/",
  "windows/",
  "macos/",
  "linux/"
];

const EXPO_STANDARD_PATHS = [
  "package.json",
  "app.json",
  "tsconfig.json",
  "src/app/_layout.tsx",
  "src/app/index.tsx",
  ".gitignore"
];

function nextScaffoldExists(files, applicationPath) {
  const prefix = applicationPath === "." ? "" : `${applicationPath}/`;
  return ["next.config.js", "next.config.mjs", "next.config.ts"].some((name) => files.has(prefix + name))
    && files.has(prefix + "package.json");
}

const NEXT_STANDARD_PATHS = ["package.json", "next.config.ts", "tsconfig.json", "src/app/", ".gitignore"];

function normalizeFlutterProjectName(value) {
  let normalized = String(value || "app")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) normalized = "app";
  if (!/^[a-z]/.test(normalized)) normalized = `app_${normalized}`;
  return normalized.slice(0, 80).replace(/_+$/g, "") || "app";
}

function workspaceFiles(inventory) {
  return new Set(asList(inventory.files));
}


function planRuntimeScaffolds(selectedIds, inventory, projectName, workspaceSettings = {}, customChoices = []) {
  const selected = new Set(selectedIds);
  const files = workspaceFiles(inventory);
  const scaffolds = [];

  if (selected.has("mobile.android-native")) {
    const existingAndroid = [...files].some((file) => /(^|\/)src\/main\/AndroidManifest\.xml$/.test(file));
    scaffolds.push({
      runtime: "android-native",
      operation: existingAndroid ? "not-needed" : "manual-design-required",
      reason: existingAndroid
        ? "An Android project is present; preserve its Gradle and module configuration."
        : "Native Android generation is not supported. Review a suitable Android Studio project scaffold and Gradle/SDK requirements separately; this plan records architecture choices only.",
      approvalRequired: true
    });
  }

  if (selected.has("language.flutter")) {
    const flutterAlreadyExists = inventory.agentGuideEvidence?.verification?.areas?.some((area) => area.runtime === "flutter" && area.directory === ".") === true;
    if (flutterAlreadyExists) {
      scaffolds.push({
        runtime: "flutter",
        operation: "not-needed",
        scaffoldPath: ".",
        reason: "A Flutter project scaffold is already present; preserve it and do not run flutter create.",
        expectedPaths: FLUTTER_STANDARD_PATHS,
        approvalRequired: true
      });
    } else if (files.size > 0) {
      scaffolds.push({
        runtime: "flutter",
        operation: "requires-empty-workspace",
        scaffoldPath: ".",
        reason: "The workspace contains files but no Flutter scaffold. Do not create a nested app or let flutter create merge with bootstrap artifacts; choose an empty workspace or plan an existing multi-app layout separately.",
        expectedPaths: FLUTTER_STANDARD_PATHS,
        approvalRequired: true
      });
    } else {
      const normalizedName = normalizeFlutterProjectName(projectName);
      scaffolds.push({
        runtime: "flutter",
        operation: "generate",
        scaffoldPath: ".",
        command: `flutter create --no-pub --project-name ${normalizedName} .`,
        workingDirectory: "workspace root",
        prerequisites: ["A locally installed Flutter SDK available on PATH."],
        purpose: "Generate the standard Flutter project structure at the workspace root without fetching packages.",
        expectedPaths: FLUTTER_STANDARD_PATHS,
        networkEffect: "No dependency fetch is requested because --no-pub is used; the locally installed Flutter SDK supplies the templates.",
        postScaffold: "Re-inspect the workspace and create a fresh artifact plan before writing bootstrap records or guides.",
        approvalRequired: true
      });
    }
  }

  if (selected.has("mobile.expo")) {
    const expoAlreadyExists = inventory.agentGuideEvidence?.capabilities?.expo?.includes(".") === true;
    if (expoAlreadyExists) {
      scaffolds.push({
        runtime: "expo",
        operation: "not-needed",
        scaffoldPath: ".",
        reason: "An Expo project scaffold is already present; preserve its generated configuration and do not run create-expo-app.",
        expectedPaths: EXPO_STANDARD_PATHS,
        approvalRequired: true
      });
    } else if (files.size > 0) {
      scaffolds.push({
        runtime: "expo",
        operation: "requires-empty-workspace",
        scaffoldPath: ".",
        reason: "The workspace contains files but no Expo scaffold. Do not create an implicit apps/<name> subproject or a nested Git repository; choose an empty workspace or plan an existing multi-app layout separately.",
        expectedPaths: EXPO_STANDARD_PATHS,
        approvalRequired: true
      });
    } else {
      scaffolds.push({
        runtime: "expo",
        operation: "generate",
        scaffoldPath: ".",
        command: `npx create-expo-app@latest . --template default --no-agents-md --yes`,
        workingDirectory: "workspace root",
        prerequisites: ["Node.js LTS and npm are already installed and available on PATH."],
        purpose: "Generate Expo Router, TypeScript, and the default iOS, Android, and web-ready project structure at the workspace root. create-expo-app derives the initial app name from that workspace directory.",
        expectedPaths: EXPO_STANDARD_PATHS,
        networkEffect: "Downloads the create-expo-app package, template, and npm dependencies. It may initialize Git when the workspace is not already a repository.",
        postScaffold: "Re-inspect the workspace, use only declared package scripts for quality checks, and create a fresh artifact plan before writing bootstrap records or guides.",
        approvalRequired: true
      });
    }
  }

  if (selected.has("frontend.nextjs")) {
    const monorepo = selected.has("repository.monorepo");
    const applicationPath = workspaceSettings.applicationPath ?? (monorepo ? undefined : ".");
    const knownPaths = applicationPath ? [applicationPath] : [".", "apps/web"];
    const existingPath = knownPaths.find((candidate) => nextScaffoldExists(files, candidate));
    const alternativePackageManager = customChoices.find((choice) => choice.category === "tool" && /^(pnpm|yarn|bun)$/i.test(choice.name)
      && (!choice.scope || [".", "repository", "apps/web", applicationPath].includes(choice.scope)));
    if (existingPath) {
      scaffolds.push({
        runtime: "nextjs",
        operation: "not-needed",
        scaffoldPath: existingPath,
        reason: "An existing Next.js scaffold is present; preserve its package and TypeScript configuration.",
        expectedPaths: NEXT_STANDARD_PATHS.map((item) => existingPath === "." ? item : `${existingPath}/${item}`),
        approvalRequired: true
      });
    } else if (!applicationPath || (applicationPath === "apps/web" && !monorepo)) {
      scaffolds.push({
        runtime: "nextjs",
        operation: "needs-layout-decision",
        reason: "Choose the Next.js application path explicitly; apps/web requires repository.monorepo.",
        choices: monorepo ? [".", "apps/web"] : ["."],
        approvalRequired: true
      });
    } else if (alternativePackageManager) {
      scaffolds.push({
        runtime: "nextjs", operation: "needs-tooling-decision", scaffoldPath: applicationPath,
        reason: `${alternativePackageManager.name} was chosen, but the supported Next.js template uses npm. Review a matching scaffold and workspace-install plan separately; no npm command is scheduled.`,
        approvalRequired: true
      });
    } else if (files.size > 0) {
      scaffolds.push({
        runtime: "nextjs",
        operation: "requires-empty-workspace",
        scaffoldPath: applicationPath,
        reason: "The workspace contains files but no Next.js scaffold. Review the existing layout before running a generator.",
        expectedPaths: NEXT_STANDARD_PATHS.map((item) => applicationPath === "." ? item : `${applicationPath}/${item}`),
        approvalRequired: true
      });
    } else {
      scaffolds.push({
        runtime: "nextjs",
        operation: "generate",
        scaffoldPath: applicationPath,
        command: `npx create-next-app@latest ${applicationPath} --yes --typescript --eslint --app --src-dir --no-tailwind --no-agents-md --no-agent-feedback --use-npm --skip-install --disable-git`,
        workingDirectory: "workspace root",
        prerequisites: ["Node.js and npm are installed; confirm the generator's current version and options before approval."],
        purpose: "Generate a standard Next.js application without installing dependencies or initializing Git.",
        expectedPaths: NEXT_STANDARD_PATHS.map((item) => applicationPath === "." ? item : `${applicationPath}/${item}`),
        networkEffect: "npx downloads the create-next-app generator; --skip-install avoids the application's dependency installation.",
        postScaffold: "Re-inspect the workspace and create a fresh artifact plan. A monorepo needs a reviewed root workspace manifest before npm install.",
        approvalRequired: true
      });
    }
  }

  return scaffolds;
}

const COLLABORATION_HOSTS = new Set(["none", "github", "gitlab", "other", "existing"]);

function normalizeWorkspaceSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { collaborationHost: "none" };
  const keys = Object.keys(value);
  if (keys.some((key) => !["collaborationHost", "applicationPath", "nodeVersion", "containerPort"].includes(key))) throw new Error("Unknown workspaceSettings field.");
  const collaborationHost = value.collaborationHost ?? "none";
  if (!COLLABORATION_HOSTS.has(collaborationHost)) throw new Error("Invalid workspaceSettings.collaborationHost.");
  if (value.applicationPath !== undefined && ![".", "apps/web"].includes(value.applicationPath)) {
    throw new Error("Invalid workspaceSettings.applicationPath.");
  }
  if (value.nodeVersion !== undefined && !["20", "22", "24"].includes(value.nodeVersion)) {
    throw new Error("Invalid workspaceSettings.nodeVersion.");
  }
  if (value.containerPort !== undefined && (!Number.isInteger(value.containerPort) || value.containerPort < 1 || value.containerPort > 65535)) {
    throw new Error("Invalid workspaceSettings.containerPort.");
  }
  return {
    collaborationHost,
    ...(value.applicationPath ? { applicationPath: value.applicationPath } : {}),
    ...(value.nodeVersion ? { nodeVersion: value.nodeVersion } : {}),
    ...(value.containerPort ? { containerPort: value.containerPort } : {})
  };
}

function workspaceConfigurationReview(inventory, workspaceSettings, guideDecisions) {
  const configuration = inventory.configuration || configurationInventory(inventory.files);
  const hostedRequirements = [];
  if (workspaceSettings.collaborationHost === "github") {
    hostedRequirements.push({
      setting: "branch-protection-or-ruleset",
      operation: "manual",
      message: "GitHub branch protection, required reviews, and status checks are host settings; this plugin does not change them."
    });
  }
  if (guideDecisions.team?.ownershipSource === "codeowners") {
    hostedRequirements.push({
      setting: "CODEOWNERS",
      operation: "manual",
      existingPaths: asList(configuration.codeowners),
      message: "Formal ownership needs a user-supplied CODEOWNERS policy and, on GitHub, a branch protection or ruleset requirement."
    });
  }
  return {
    pluginState: {
      path: ".project-bootstrap/selection.yaml",
      ownership: "project-bootstrap"
    },
    codexProjectConfig: {
      operation: "preserve",
      existingPaths: configuration.codexConfigs,
      message: "This plugin does not create or rewrite .codex/config.toml. Native Codex settings remain under the user's and trusted project's configuration layers."
    },
    collaborationHost: workspaceSettings.collaborationHost,
    existing: configuration,
    hostedRequirements
  };
}

function artifactOperation(file, template, inventory) {
  const files = new Set(asList(inventory.files));
  if (files.has(file)) return { path: file, template, operation: "conflict", approvalRequired: true };
  if (file === "AGENTS.md" && files.has("AGENTS.override.md")) {
    return { path: file, template, operation: "merge-preview", relatedPaths: ["AGENTS.override.md"], approvalRequired: true,
      message: "An existing AGENTS.override.md may shadow this guide. Review the active instruction file and its scope before creating AGENTS.md." };
  }

  if (file === ".github/pull_request_template.md") {
    const existingTemplates = asList((inventory.configuration || configurationInventory(inventory.files)).pullRequestTemplates)
      .filter((path) => path !== file);
    if (existingTemplates.length) {
      return {
        path: file,
        template,
        operation: "merge-preview",
        relatedPaths: existingTemplates,
        approvalRequired: true,
        message: "An existing pull-request template uses another supported GitHub location. Review a path-specific merge or replacement; no file write is planned."
      };
    }
  }
  return { path: file, template, operation: "create", approvalRequired: true };
}

function blockedPlan(validation, message) {
  return {
    status: "blocked",
    validation,
    artifacts: [],
    commands: [],
    message
  };
}

export function createPlan(entries, { selectedIds, customChoices = [], projectName, requirements = {}, guideDecisions = {}, workspaceSettings = {}, inventory = {}, locale = "en" } = {}) {
  if (arguments[1]?.selection !== undefined) {
    if (selectedIds !== undefined) throw new Error("Use either selection or selectedIds, not both.");
    return createPlatformPlan(arguments[1].selection, { inventory, requirements: { ...requirements, collaborationHost: requirements.collaborationHost ?? workspaceSettings.collaborationHost }, hostPlatform: arguments[1].hostPlatform });
  }
  if (selectedIds === undefined) throw new Error("Provide selectedIds or selection.");
  const validation = validateSelection(entries, { selectedIds, customChoices, requirements, inventory, locale });
  if (validation.status === "block") {
    return blockedPlan(validation, "Resolve blocking rules before requesting a writable plan.");
  }
  if (inventory.truncated || inventory.agentGuideEvidence?.verification?.collection?.complete === false) {
    const completeInventoryValidation = {
      ...validation,
      status: "block",
      messages: [...validation.messages, {
        status: "block",
        code: "incomplete-workspace-inventory",
        message: "The workspace paths or manifest metadata are incomplete. Re-inspect the reported gaps before planning file changes."
      }]
    };
    return blockedPlan(completeInventoryValidation, "A complete workspace inventory is required before planning local configuration changes.");
  }

  const normalizedWorkspaceSettings = normalizeWorkspaceSettings(workspaceSettings);
  const normalizedGuideDecisions = normalizeGuideDecisions(guideDecisions, {
    allowPullRequest: normalizedWorkspaceSettings.collaborationHost === "github"
  });
  const agentsGuide = createAgentsGuideBlueprint(inventory, normalizedGuideDecisions.agents, { selectedIds, locale, projectName: projectName || requirements.projectName || "Project", catalogVersion: PLUGIN_VERSION });
  const scaffolds = planRuntimeScaffolds(selectedIds, inventory, projectName || requirements.projectName, normalizedWorkspaceSettings, validation.customChoices);
  const unresolvedScaffolds = scaffolds.filter((scaffold) => ["needs-layout-decision", "needs-tooling-decision", "requires-empty-workspace"].includes(scaffold.operation));
  if (unresolvedScaffolds.length) {
    return {
      ...blockedPlan(validation, "Resolve the runtime layout or choose a suitable empty workspace before planning artifact writes."),
      selectedIds: [...new Set(selectedIds)],
      workspaceSettings: normalizedWorkspaceSettings,
      scaffolds,
      runtimeSetup: { artifactWritePhase: "pending-runtime-decision", reinspectionRequired: true }
    };
  }
  const scaffoldFirst = scaffolds.some((scaffold) => scaffold.operation === "generate");
  const artifacts = [...COMMON_ARTIFACTS, ...plannedAdapterArtifacts(selectedIds, inventory), ...agentsGuide.supportingDocuments.map((document) => [document.path, "agents-evidence"])];
  if (selectedIds.includes("mobile.android-native")) artifacts.push(["docs/architecture/android-ui.md", "android-ui-decision"]);
  if (validation.customChoices.length) artifacts.push(["docs/project-bootstrap/custom-choices.md", "custom-choice-record"]);
  const nextApplicationPath = scaffolds.find((scaffold) => scaffold.runtime === "nextjs")?.scaffoldPath;
  const needsWorkspaceManifest = selectedIds.includes("frontend.nextjs")
    && selectedIds.includes("repository.monorepo")
    && nextApplicationPath === "apps/web"
    && !asList(inventory.files).includes("package.json");
  if (needsWorkspaceManifest) artifacts.push(["package.json", "npm-workspace-root"]);
  for (const id of selectedIds) {
    artifacts.push(...(DELIVERY_ARTIFACTS[id] || []));
  }
  if (normalizedWorkspaceSettings.collaborationHost === "github" && normalizedGuideDecisions.pullRequest) {
    artifacts.push([".github/pull_request_template.md", "pull-request-template"]);
  }
  const deduplicated = new Map(artifacts.map(([file, template]) => [file, template]));
  const plans = [...deduplicated].map(([file, template]) => {
    const plan = artifactOperation(file, template, inventory);
    if (file === "AGENTS.md") plan.content = agentsGuide.markdown;
    if (template === "agents-evidence") plan.content = agentsGuide.supportingDocuments.find((document) => document.path === file).content;
    if (template === "custom-choice-record") {
      plan.content = "# User-defined project choices\n\nThese choices are planning records, not generated integrations. Review compatibility, installation, configuration, verification, and operating requirements before implementation.\n\n"
        + JSON.stringify(validation.customChoices, null, 2).split("\n").map((line) => `    ${line}`).join("\n") + "\n";
    }
    if (template === "android-ui-decision") {
      const kindOf = (id) => entries.find((entry) => entry.attributes.id === id)?.attributes.kind;
      const patternIds = selectedIds.filter((id) => kindOf(id) === "ui-architecture");
      const stateIds = selectedIds.filter((id) => kindOf(id) === "state-management");
      const customAndroid = validation.customChoices.filter((choice) => ["architecture", "library"].includes(choice.category)
        && (/android/i.test(choice.scope) || choice.replacesId?.startsWith("android.")));
      plan.content = [
        "# Android UI architecture decision",
        "",
        "This record captures reviewed project choices, not an implemented Android application.",
        "",
        `- UI architecture: ${patternIds.length ? patternIds.join(", ") : "no catalogue pattern selected"}`,
        `- State management: ${stateIds.length ? stateIds.join(", ") : "no catalogue implementation selected"}`,
        `- Scoped custom choices: ${customAndroid.length ? customAndroid.map((choice) => `${choice.category} ${JSON.stringify(choice.name)} (${JSON.stringify(choice.scope)})`).join(", ") : "none"}`,
        "",
        "Keep screen state ownership, event handling, lifecycle collection, and test boundaries consistent with the selected combination. Review Android Gradle dependencies, versions, and migration separately before editing app code.",
        ""
      ].join("\n");
    }
    if (template === "npm-workspace-root") {
      plan.content = JSON.stringify({ name: "project-workspace", private: true, workspaces: ["apps/*"] }, null, 2) + "\n";
    }
    const deliveryId = Object.keys(DELIVERY_ARTIFACTS).find((id) => DELIVERY_ARTIFACTS[id].some(([target]) => target === file));
    if (deliveryId && plan.operation === "create") {
      const readiness = deliveryReadiness(deliveryId, inventory, selectedIds, normalizedWorkspaceSettings, validation.customChoices);
      if (readiness.ready) plan.content = readiness.content;
      else {
        plan.operation = "deferred";
        plan.reason = readiness.reason;
      }
    }
    return scaffoldFirst && plan.operation === "create"
      ? { ...plan, phase: "post-runtime-scaffold" }
      : plan;
  });
  const detailConflicts = plans.filter((plan) => plan.template === "agents-evidence" && plan.operation !== "create");
  const rootGuide = plans.find((plan) => plan.path === "AGENTS.md");
  if (detailConflicts.length && rootGuide?.operation === "create") {
    rootGuide.operation = "merge-preview";
    rootGuide.relatedPaths = detailConflicts.map((plan) => plan.path);
    rootGuide.message = "The generated guide depends on an existing evidence index. Review that content before creating a root guide that links to it.";
  }
  const scaffoldCommands = scaffolds
    .filter((scaffold) => scaffold.operation === "generate")
    .map(({ command, workingDirectory, prerequisites, purpose, expectedPaths, networkEffect, postScaffold, approvalRequired }) => ({
      command,
      workingDirectory,
      prerequisites,
      purpose,
      expectedPaths,
      networkEffect,
      postScaffold,
      approvalRequired
    }));

  const requiresReview = validation.status === "warning" || agentsGuide.status === "needs-confirmation" || plans.some((plan) => ["merge-preview", "deferred"].includes(plan.operation)) || scaffolds.some((scaffold) => ["requires-empty-workspace", "needs-layout-decision", "manual-design-required"].includes(scaffold.operation));
  return {
    status: requiresReview ? "ready-with-warnings" : "ready",
    validation,
    selectedIds: [...new Set(selectedIds)],
    customChoices: validation.customChoices,
    guidePolicySchemaVersion: GUIDE_POLICY_SCHEMA_VERSION,
    guideDecisions: normalizedGuideDecisions,
    agentsGuide,
    workspaceSettings: normalizedWorkspaceSettings,
    configurationReview: workspaceConfigurationReview(inventory, normalizedWorkspaceSettings, normalizedGuideDecisions),
    artifacts: plans,
    scaffolds,
    runtimeSetup: {
      artifactWritePhase: scaffoldFirst ? "post-runtime-scaffold" : "ready",
      reinspectionRequired: scaffoldFirst,
      message: scaffoldFirst
        ? "A runtime scaffold must be approved and completed before bootstrap artifacts are written. Re-inspect and create a fresh plan after generation so guides use the real repository map and declared verification scripts."
        : "No runtime scaffold is pending before bootstrap artifact generation."
    },
    commands: scaffoldCommands.length ? scaffoldCommands : needsWorkspaceManifest ? [{
      command: "npm install",
      workingDirectory: "workspace root",
      purpose: "Install the generated Next.js workspace dependencies and create the root lockfile after the reviewed workspace manifest is written.",
      networkEffect: "Downloads application dependencies.",
      expectedPaths: ["package-lock.json", "node_modules/"],
      approvalRequired: true
    }] : [
      {
        command: "No command is scheduled by default.",
        purpose: "This plan only creates documentation and configuration drafts after file-plan approval.",
        approvalRequired: true
      }
    ],
    safeguards: [
      "No filesystem writes are performed by this MCP tool.",
      "Conflicting or merge-preview files require a path-specific decision.",
      "Existing .codex/config.toml files are preserved and never rewritten by this plugin.",
      "Dependency installation, runtime scaffolding commands, and Git operations require separate approval."
    ]
  };
}

function reviewedRelativePath(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("\\") || value.startsWith("/") || value.includes("\0")) {
    throw new Error("Evidence paths must be non-empty workspace-relative POSIX paths.");
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("Evidence paths cannot contain empty, dot, or parent segments.");
  }
  return value;
}

function reviewedDirectory(value) {
  return value === "." ? "." : reviewedRelativePath(value);
}

function checkKey(directory, command) {
  return `${directory}\0${command}`;
}

export async function assessImplementation({ root, requirements = [], reportedChecks = [] } = {}) {
  if (!Array.isArray(requirements) || requirements.length > 30 || !Array.isArray(reportedChecks) || reportedChecks.length > 40) {
    throw new Error("Assessment input exceeds the supported bounds.");
  }
  const inventory = await inspectWorkspace({ root, maxDepth: 12, maxFiles: 2000 });
  if (inventory.truncated || inventory.agentGuideEvidence.verification.collection.complete === false) {
    return { status: "blocked", reason: "Workspace inventory or metadata collection is incomplete; no coverage conclusion is possible." };
  }
  const files = new Set(inventory.files);
  const ids = new Set();
  const reported = new Map();
  for (const item of reportedChecks) {
    if (!item || typeof item.command !== "string" || !item.command.trim() || !["passed", "failed", "unavailable"].includes(item.status) || typeof item.source !== "string" || !item.source.trim()) {
      throw new Error("Each reported check needs a command, status, and non-empty source.");
    }
    const directory = reviewedDirectory(item.directory ?? ".");
    const key = checkKey(directory, item.command);
    if (reported.has(key)) throw new Error("Duplicate reported check command and directory.");
    reported.set(key, { directory, command: item.command, status: item.status, source: item.source });
  }
  const declared = inventory.agentGuideEvidence.verification.commands
    .filter((item) => item.suitableForVerification)
    .map((item) => ({ command: item.command, directory: item.directory, workingDirectory: item.workingDirectory, kind: item.kind }));
  const declaredCommands = new Set(declared.map((item) => checkKey(item.directory, item.command)));
  const checks = declared.map((item) => ({
    ...item,
    status: reported.get(checkKey(item.directory, item.command))?.status ?? "not-run",
    source: reported.get(checkKey(item.directory, item.command))?.source ?? null,
    provenance: reported.has(checkKey(item.directory, item.command)) ? "caller-reported" : "inventory-only"
  }));
  const criteria = requirements.map((item) => {
    if (!item || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id) || typeof item.description !== "string" || !item.description.trim()) {
      throw new Error("Each requirement needs a unique ID and description.");
    }
    ids.add(item.id);
    if (!Array.isArray(item.evidencePaths ?? [])) throw new Error("Requirement evidencePaths must be an array.");
    const paths = (item.evidencePaths ?? []).map(reviewedRelativePath);
    const checkDirectory = reviewedDirectory(item.checkDirectory ?? ".");
    const checkCommands = item.checkCommands ?? [];
    if (!Array.isArray(checkCommands) || checkCommands.some((command) => typeof command !== "string")) {
      throw new Error("Requirement checkCommands must be strings.");
    }
    const criterionChecks = checkCommands.map((command) => ({
      command,
      directory: checkDirectory,
      status: reported.get(checkKey(checkDirectory, command))?.status ?? "not-run",
      declared: declaredCommands.has(checkKey(checkDirectory, command)),
      provenance: reported.has(checkKey(checkDirectory, command)) ? "caller-reported" : "inventory-only"
    }));
    return {
      id: item.id,
      description: item.description,
      presentPaths: paths.filter((file) => files.has(file)),
      missingPaths: paths.filter((file) => !files.has(file)),
      checks: criterionChecks,
      status: paths.length === 0 ? "unmapped"
        : paths.some((file) => !files.has(file)) ? "missing-file-evidence"
          : criterionChecks.some((check) => check.status === "failed") ? "reported-check-failed"
            : "requires-behavior-review"
    };
  });
  const drift = [];
  for (const file of ["README.md", "docs/architecture/overview.md"]) {
    if (!files.has(file)) continue;
    const absolute = path.join(inventory.root, file);
    if ((await fs.stat(absolute)).size > 128_000) continue;
    const content = await fs.readFile(absolute, "utf8");
    const hasProductSource = inventory.files.some((candidate) => /(?:^|\/)src\/app\/api\/|(?:^|\/)src\/components\//.test(candidate));
    const hasSchema = inventory.files.some((candidate) => /(?:^|\/)src\/lib\/db\/schema\.[cm]?[jt]s$/.test(candidate));
    if (hasProductSource && /(?:no product implementation|no product workflows|제품 기능이 없)/i.test(content)) {
      drift.push({ path: file, code: "stale-product-absence", message: "Document says product functionality is absent while product source paths exist; review the statement." });
    }
    if (hasSchema && /(?:no (?:product .*?, )?database schema|no data schema|데이터 스키마가 없)/i.test(content)) {
      drift.push({ path: file, code: "stale-schema-absence", message: "Document says a schema is absent while a schema path exists; review the statement." });
    }
  }
  const reviewPrompts = [];
  if (inventory.files.some((file) => /(?:^|\/)src\/lib\/db\/schema\.[cm]?[jt]s$/.test(file))) {
    reviewPrompts.push("Check database pool lifetime, migration execution, transaction boundaries, and integration tests against a migrated database.");
  }
  if (inventory.files.some((file) => /(?:^|\/)src\/app\/edit\//.test(file))) {
    reviewPrompts.push("Check editor-link leakage, server-side authorization on every mutation, session lifetime, and secret rotation.");
  }
  if (inventory.files.some((file) => /(?:^|\/)rate-limit\.[cm]?[jt]s$/.test(file))) {
    reviewPrompts.push("Check the trusted client address source and whether rate limits work across processes and instances.");
  }
  return {
    status: "needs-review",
    root: inventory.root,
    inventoryComplete: true,
    criteria,
    checks,
    unrecognizedReportedChecks: [...reported.entries()].filter(([key]) => !declaredCommands.has(key)).map(([, value]) => ({ directory: value.directory, command: value.command })),
    documentationDrift: drift,
    reviewPrompts,
    limitation: "File presence and caller-reported check results do not establish acceptance behavior. Review code and execute relevant checks before claiming implementation complete."
  };
}

function parseSemver(version) {
  const matched = String(version || "").match(/^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/);
  if (!matched) return undefined;
  return matched.slice(1, 4).map(Number);
}

function compareSemver(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}

export function checkUpdates({ installedVersion = PLUGIN_VERSION, availableVersion, releaseNotes } = {}) {
  const installed = parseSemver(installedVersion);
  const available = parseSemver(availableVersion);
  if (!availableVersion) {
    return {
      installedVersion,
      updateAvailable: false,
      message: "No marketplace version was supplied. Ask before checking the network or upgrading."
    };
  }
  if (!installed || !available) throw new Error("Versions must use semantic version format, for example 0.1.0.");
  const updateAvailable = compareSemver(installed, available) < 0;
  return {
    installedVersion,
    availableVersion,
    updateAvailable,
    releaseNotes: releaseNotes || "",
    message: updateAvailable ? "An update is available. Ask the user before upgrading." : "The installed version is current or newer."
  };
}

export async function invokeTool(name, args = {}) {
  const catalog = ["inspect_workspace", "assess_implementation", "list_workspace_guide_policies", "render_workspace_guide_configurator", "submit_workspace_guide_configuration", "check_updates", "list_platform_choices"].includes(name) ? undefined : await loadCatalog();
  switch (name) {
    case "inspect_workspace": return inspectWorkspace(args);
    case "assess_implementation": return assessImplementation(args);
    case "list_workspace_guide_policies": return { schemaVersion: GUIDE_POLICY_SCHEMA_VERSION, guides: listGuidePolicies(args) };
    case "render_workspace_guide_configurator": return createWorkspaceGuideConfigurator(args);
    case "submit_workspace_guide_configuration": return submitWorkspaceGuideConfiguration(args);
    case "list_platform_choices": return listPlatformChoices(args);
    case "list_catalog": return listCatalog(catalog, args);
    case "render_catalog_explorer": return createCatalogExplorer(catalog, args);
    case "submit_catalog_selection": return submitCatalogSelection(catalog, args);
    case "recommend": return recommend(catalog, args);
    case "validate_selection": return validateSelection(catalog, args);
    case "create_plan": return createPlan(catalog, { ...args, hostPlatform: undefined });
    case "check_updates": return checkUpdates(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
