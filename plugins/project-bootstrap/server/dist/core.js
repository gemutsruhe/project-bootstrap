import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDE_POLICY_SCHEMA_VERSION, listGuidePolicies, normalizeGuideDecisions } from "./guide-policies.js";
import { createAgentGuideEvidence, isAgentMetadataPath } from "./agent-evidence.js";
import { createAgentsGuideBlueprint } from "./agents-guide.js";

export { listGuidePolicies } from "./guide-policies.js";
export { createAgentGuideEvidence } from "./agent-evidence.js";
export { createAgentsGuideBlueprint } from "./agents-guide.js";

export const PLUGIN_VERSION = "0.6.1";
export const CATALOG_EXPLORER_RESOURCE_URI = "ui://project-bootstrap/catalog-explorer-v2.html";

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
    description: "Read a local workspace inventory plus a redacted summary of applicable Codex and Project Bootstrap preferences without changing files. Raw configuration values are never returned. Set PROJECT_BOOTSTRAP_ALLOWED_ROOT to restrict readable workspace paths; otherwise the response reports that the host did not provide a boundary.",
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
        candidateIds: { type: "array", minItems: 1, maxItems: 12, items: { type: "string" }, description: "Exactly the candidate IDs shown in the Explorer." },
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
    description: "Evaluate selected catalogue IDs against deterministic requirements, incompatibilities, and warnings.",
    inputSchema: {
      type: "object",
      properties: {
        selectedIds: { type: "array", minItems: 1, items: { type: "string" } },
        requirements: { type: "object" },
        inventory: { type: "object" },
        locale: { type: "string", enum: ["en", "ko"], default: "en" }
      },
      required: ["selectedIds"],
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
    name: "create_plan",
    description: "Produce a read-only local bootstrap plan, including a source-grounded AGENTS.md blueprint, supported runtime scaffold commands, and reviewed workspace-guide decisions. A blocked selection produces no writable plan.",
    inputSchema: {
      type: "object",
      properties: {
        selectedIds: { type: "array", minItems: 1, items: { type: "string" } },
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
          description: "Reviewed workspace-wide settings. GitHub-specific files are considered only when collaborationHost is github. Existing Codex configuration is always preserved and is never rewritten by this plugin. New runtime scaffolds target an empty workspace root; an existing multi-app layout must be inspected and planned separately.",
          properties: {
            collaborationHost: { type: "string", enum: ["none", "github", "gitlab", "other", "existing"] }
          },
          additionalProperties: false
        },
        inventory: { type: "object" },
        locale: { type: "string", enum: ["en", "ko"], default: "en" }
      },
      required: ["selectedIds"],
      additionalProperties: false
    }
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

export function createCatalogExplorer(entries, { candidateIds, locale = "en", title } = {}) {
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

  return {
    title: title || (locale === "ko" ? "카탈로그 후보 비교" : "Catalog candidate comparison"),
    locale,
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

  const selected = byId.get(selectedId);
  if (!selected) throw new Error(`Unknown catalogue ID: ${selectedId}`);
  const normalizedComment = typeof comment === "string" ? comment.trim() : "";
  if (normalizedComment.length > 2000) throw new Error("comment must be 2000 characters or fewer.");

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

function isWithin(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveWorkspaceRoot(root) {
  if (typeof root !== "string" || !root.trim()) throw new Error("root is required.");
  const resolved = path.resolve(root);
  const allowedRoot = process.env.PROJECT_BOOTSTRAP_ALLOWED_ROOT;
  if (allowedRoot && !isWithin(resolved, path.resolve(allowedRoot))) {
    throw new Error("The workspace path is outside PROJECT_BOOTSTRAP_ALLOWED_ROOT.");
  }
  return resolved;
}

function workspaceAccessScope() {
  const allowedRoot = process.env.PROJECT_BOOTSTRAP_ALLOWED_ROOT?.trim();
  return allowedRoot
    ? { mode: "restricted", allowedRoot: path.resolve(allowedRoot) }
    : {
        mode: "host-boundary-not-configured",
        message: "Set PROJECT_BOOTSTRAP_ALLOWED_ROOT to the trusted workspace root to restrict inspection paths."
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
        suggestedIds: asList(profile.attributes.suggests)
      };
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function statusSummary(messages) {
  if (messages.some((message) => message.status === "block")) return "block";
  if (messages.some((message) => message.status === "warning")) return "warning";
  return "pass";
}

export function validateSelection(entries, { selectedIds, requirements = {}, inventory = {}, locale = "en" } = {}) {
  const byId = new Map(entries.map((entry) => [entry.attributes.id, entry]));
  const selected = [...new Set(asList(selectedIds))];
  const selectedSet = new Set(selected);
  const messages = [];

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
  return { status: statusSummary(messages), selectedIds: selected, messages };
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
  const expoOwnsTypeScriptConfig = selected.has("mobile.expo");
  const artifacts = [];
  for (const id of selected) {
    for (const [file, template] of ADAPTER_ARTIFACTS[id] || []) {
      // create-expo-app owns the generated tsconfig and its Expo base extension.
      // Writing a generic root configuration first makes a later root scaffold fail
      // or leaves two conflicting TypeScript baselines.
      if (expoOwnsTypeScriptConfig && file === "tsconfig.json") continue;
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


function planRuntimeScaffolds(selectedIds, inventory, projectName) {
  const selected = new Set(selectedIds);
  const files = workspaceFiles(inventory);
  const scaffolds = [];

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

  return scaffolds;
}

const COLLABORATION_HOSTS = new Set(["none", "github", "gitlab", "other", "existing"]);

function normalizeWorkspaceSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { collaborationHost: "none" };
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "collaborationHost")) throw new Error("Unknown workspaceSettings field.");
  const collaborationHost = value.collaborationHost ?? "none";
  if (!COLLABORATION_HOSTS.has(collaborationHost)) throw new Error("Invalid workspaceSettings.collaborationHost.");
  return { collaborationHost };
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

export function createPlan(entries, { selectedIds, projectName, requirements = {}, guideDecisions = {}, workspaceSettings = {}, inventory = {}, locale = "en" } = {}) {
  const validation = validateSelection(entries, { selectedIds, requirements, inventory, locale });
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
  const scaffolds = planRuntimeScaffolds(selectedIds, inventory, projectName || requirements.projectName);
  const scaffoldFirst = scaffolds.some((scaffold) => scaffold.operation === "generate" && scaffold.scaffoldPath === ".");
  const artifacts = [...COMMON_ARTIFACTS, ...plannedAdapterArtifacts(selectedIds, inventory), ...agentsGuide.supportingDocuments.map((document) => [document.path, "agents-evidence"])];
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

  const requiresReview = validation.status === "warning" || agentsGuide.status === "needs-confirmation" || plans.some((plan) => plan.operation === "merge-preview") || scaffolds.some((scaffold) => scaffold.operation === "requires-empty-workspace");
  return {
    status: requiresReview ? "ready-with-warnings" : "ready",
    validation,
    selectedIds: [...new Set(selectedIds)],
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
        ? "A root runtime scaffold must be approved and completed before bootstrap artifacts are written. Re-inspect and create a fresh plan after generation so guides use the real repository map and declared verification scripts."
        : "No root runtime scaffold is pending before bootstrap artifact generation."
    },
    commands: scaffoldCommands.length ? scaffoldCommands : [
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
  const catalog = ["inspect_workspace", "list_workspace_guide_policies", "check_updates"].includes(name) ? undefined : await loadCatalog();
  switch (name) {
    case "inspect_workspace": return inspectWorkspace(args);
    case "list_workspace_guide_policies": return { schemaVersion: GUIDE_POLICY_SCHEMA_VERSION, guides: listGuidePolicies(args) };
    case "list_catalog": return listCatalog(catalog, args);
    case "render_catalog_explorer": return createCatalogExplorer(catalog, args);
    case "submit_catalog_selection": return submitCatalogSelection(catalog, args);
    case "recommend": return recommend(catalog, args);
    case "validate_selection": return validateSelection(catalog, args);
    case "create_plan": return createPlan(catalog, args);
    case "check_updates": return checkUpdates(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
