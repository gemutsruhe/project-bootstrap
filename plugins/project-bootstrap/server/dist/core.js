import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_VERSION = "0.2.3";
export const CATALOG_EXPLORER_RESOURCE_URI = "ui://project-bootstrap/catalog-explorer-v1.html";

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
  "target"
]);

const TOOL_DEFINITIONS = [
  {
    name: "inspect_workspace",
    description: "Read a local workspace inventory plus a redacted summary of applicable Codex and Project Bootstrap preferences without changing files. Raw configuration values are never returned. Set PROJECT_BOOTSTRAP_ALLOWED_ROOT to restrict readable workspace paths.",
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
    name: "recommend",
    description: "Rank starting profiles using explicit requirements and a workspace inventory. Recommendations never select technologies automatically.",
    inputSchema: {
      type: "object",
      properties: {
        requirements: {
          type: "object",
          properties: {
            productType: { type: "string" },
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
    name: "create_plan",
    description: "Produce a read-only local bootstrap plan. A blocked selection produces no writable plan.",
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

async function readTextIfExists(file, limit = 128_000) {
  try {
    const content = await fs.readFile(file, "utf8");
    return content.slice(0, limit);
  } catch {
    return undefined;
  }
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
    precedence: "project-over-user"
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
  const truncated = { value: false };

  async function visit(directory, depth) {
    if (depth > maxDepth || files.length >= maxFiles) {
      truncated.value = true;
      return;
    }
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (files.length >= maxFiles) {
        truncated.value = true;
        return;
      }
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(directory, entry.name);
      const relative = path.relative(workspace, fullPath).replaceAll(path.sep, "/");
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(fullPath, depth + 1);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  }

  try {
    await visit(workspace, 0);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`Workspace does not exist: ${workspace}`);
    throw error;
  }

  const fileSet = new Set(files);
  const packageJson = await readTextIfExists(path.join(workspace, "package.json"));
  const pyproject = await readTextIfExists(path.join(workspace, "pyproject.toml"));
  const goMod = await readTextIfExists(path.join(workspace, "go.mod"));
  const pom = await readTextIfExists(path.join(workspace, "pom.xml"));
  const gradle = await readTextIfExists(path.join(workspace, "build.gradle.kts"));
  const csproj = files.find((file) => file.endsWith(".csproj"));
  const pubspec = await readTextIfExists(path.join(workspace, "pubspec.yaml"));

  const languages = [];
  if (packageJson) languages.push("typescript");
  if (pyproject || files.some((file) => file.endsWith(".py"))) languages.push("python");
  if (goMod || files.some((file) => file.endsWith(".go"))) languages.push("go");
  const hasJava = files.some((file) => file.endsWith(".java"));
  const hasKotlin = files.some((file) => file.endsWith(".kt"));
  if (hasJava) languages.push("java");
  if (hasKotlin) languages.push("kotlin");
  if ((pom || gradle) && !hasJava && !hasKotlin) languages.push("jvm");
  if (csproj || files.some((file) => file.endsWith(".cs"))) languages.push("dotnet");
  if (pubspec || files.some((file) => file.endsWith(".dart"))) languages.push("flutter");

  const codexSettings = await inspectCodexSettings(workspace, {
    globalConfigPath: globalCodexConfigPath,
    localConfigPath: localCodexConfigPath
  });
  const programmingLanguageDecision = determineProgrammingLanguageDecision(languages);
  const responseLocaleDecision = determineResponseLocaleDecision(codexSettings);

  return {
    root: workspace,
    state: files.length === 0 ? "new" : "existing",
    files,
    fileCount: files.length,
    truncated: truncated.value,
    languages,
    codexSettings,
    programmingLanguageDecision,
    responseLocaleDecision,
    manifests: {
      packageJson: Boolean(packageJson),
      pyproject: Boolean(pyproject),
      goMod: Boolean(goMod),
      maven: Boolean(pom),
      gradle: Boolean(gradle),
      dotnet: Boolean(csproj),
      flutter: Boolean(pubspec)
    },
    existingBootstrapArtifacts: [
      "AGENTS.md",
      ".codex/config.toml",
      ".project-bootstrap/selection.yaml",
      "docs/project-bootstrap/decision-record.md"
    ].filter((artifact) => fileSet.has(artifact)),
    detected: {
      docker: fileSet.has("Dockerfile") || fileSet.has("docker-compose.yml") || fileSet.has("compose.yaml"),
      githubActions: files.some((file) => file.startsWith(".github/workflows/")),
      kubernetes: files.some((file) => file.startsWith("k8s/") || file.startsWith("kubernetes/")),
      terraform: files.some((file) => file.endsWith(".tf"))
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

  if (!messages.length) messages.push({ status: "pass", code: "validated", message: "The selected catalogue rules passed." });
  return { status: statusSummary(messages), selectedIds: selected, messages };
}

const COMMON_ARTIFACTS = [
  [".project-bootstrap/selection.yaml", "decision-record"],
  ["docs/project-bootstrap/decision-record.md", "decision-record"],
  ["docs/project-bootstrap/validation-report.md", "validation-report"],
  ["docs/project-bootstrap/execution-plan.md", "execution-plan"],
  ["docs/architecture/overview.md", "architecture-overview"],
  ["AGENTS.md", "codex-instructions"],
  [".codex/config.toml", "codex-project-config"],
  [".env.example", "environment-contract"],
  ["docker-compose.yml", "local-container-orchestration"],
  [".github/workflows/ci.yml", "ci-workflow"]
];

const ADAPTER_ARTIFACTS = {
  "language.typescript": [["tsconfig.json", "typescript-compiler-config"], ["docs/architecture/interfaces/typescript.md", "typescript-interface-contract"]],
  "language.python": [["pyproject.toml", "python-project-config"], ["docs/architecture/interfaces/python.md", "python-interface-contract"]],
  "language.java": [["build.gradle.kts", "java-build-config"], ["docs/architecture/interfaces/jvm.md", "jvm-interface-contract"]],
  "language.kotlin": [["build.gradle.kts", "kotlin-build-config"], ["docs/architecture/interfaces/jvm.md", "jvm-interface-contract"]],
  "language.go": [["go.mod", "go-module-config"], ["docs/architecture/interfaces/go.md", "go-interface-contract"]],
  "language.dotnet": [["Directory.Build.props", "dotnet-build-config"], ["docs/architecture/interfaces/dotnet.md", "dotnet-interface-contract"]],
  "language.flutter": [["analysis_options.yaml", "flutter-analysis-config"], ["docs/architecture/interfaces/flutter.md", "flutter-interface-contract"]]
};

export function createPlan(entries, { selectedIds, requirements = {}, inventory = {}, locale = "en" } = {}) {
  const validation = validateSelection(entries, { selectedIds, requirements, inventory, locale });
  if (validation.status === "block") {
    return {
      status: "blocked",
      validation,
      artifacts: [],
      commands: [],
      message: "Resolve blocking rules before requesting a writable plan."
    };
  }

  const knownFiles = new Set(asList(inventory.files));
  const artifacts = [...COMMON_ARTIFACTS];
  for (const id of selectedIds) artifacts.push(...(ADAPTER_ARTIFACTS[id] || []));
  const deduplicated = new Map(artifacts.map(([file, template]) => [file, template]));
  const plans = [...deduplicated].map(([file, template]) => ({
    path: file,
    template,
    operation: knownFiles.has(file) ? "conflict" : "create",
    approvalRequired: true
  }));

  return {
    status: validation.status === "warning" ? "ready-with-warnings" : "ready",
    validation,
    selectedIds: [...new Set(selectedIds)],
    artifacts: plans,
    commands: [
      {
        command: "No command is scheduled by default.",
        purpose: "This plan only creates documentation and configuration drafts after file-plan approval.",
        approvalRequired: true
      }
    ],
    safeguards: [
      "No filesystem writes are performed by this MCP tool.",
      "Conflicting existing files require a path-specific decision.",
      "Dependency installation, scaffolding commands, and Git operations require separate approval."
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
  const catalog = name === "inspect_workspace" || name === "check_updates" ? undefined : await loadCatalog();
  switch (name) {
    case "inspect_workspace": return inspectWorkspace(args);
    case "list_catalog": return listCatalog(catalog, args);
    case "render_catalog_explorer": return createCatalogExplorer(catalog, args);
    case "recommend": return recommend(catalog, args);
    case "validate_selection": return validateSelection(catalog, args);
    case "create_plan": return createPlan(catalog, args);
    case "check_updates": return checkUpdates(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
