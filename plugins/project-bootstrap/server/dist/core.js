import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDE_POLICY_SCHEMA_VERSION, listGuidePolicies, normalizeGuideDecisions } from "./guide-policies.js";

export { listGuidePolicies } from "./guide-policies.js";

export const PLUGIN_VERSION = "0.5.0";
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
  "target"
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
        projectName: { type: "string", minLength: 1, maxLength: 80, description: "Name used by a supported runtime scaffold, such as a Flutter package name." },
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
          description: "Reviewed workspace-wide settings. GitHub-specific files are considered only when collaborationHost is github. Existing Codex configuration is always preserved and is never rewritten by this plugin.",
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

const SOURCE_ROOT_NAMES = ["src", "app", "apps", "packages", "lib", "server", "client", "backend", "frontend", "web", "mobile"];
const TEST_ROOT_NAMES = ["test", "tests", "__tests__", "spec", "specs", "e2e", "integration"];
const DOCUMENTATION_ROOT_NAMES = ["docs", "doc", "documentation", "examples"];
const MANIFEST_NAMES = new Set([
  "package.json",
  "pyproject.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "pubspec.yaml",
  "global.json"
]);
const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "poetry.lock",
  "uv.lock",
  "Pipfile.lock",
  "packages.lock.json"
]);

function presentRepositoryRoots(files, names) {
  const knownNames = new Set(names);
  const roots = new Set();
  for (const file of asList(files)) {
    const segments = file.split("/");
    segments.pop();
    for (let index = 0; index < segments.length; index += 1) {
      if (knownNames.has(segments[index])) roots.add(`${segments.slice(0, index + 1).join("/")}/`);
    }
  }
  return [...roots].sort();
}

function nodeScriptRunner(manifest, files) {
  const packageManager = String(manifest?.packageManager || "").toLowerCase();
  if (packageManager.startsWith("pnpm@") || asList(files).includes("pnpm-lock.yaml")) return "pnpm run";
  if (packageManager.startsWith("yarn@") || asList(files).includes("yarn.lock")) return "yarn";
  if (packageManager.startsWith("bun@") || asList(files).some((file) => file === "bun.lock" || file === "bun.lockb")) return "bun run";
  return "npm run";
}

function declaredNodeVerificationCommands(packageJson, files, manifestPath = "package.json") {
  if (!packageJson) return [];
  let manifest;
  try {
    manifest = JSON.parse(packageJson);
  } catch {
    return [];
  }
  if (!manifest.scripts || typeof manifest.scripts !== "object" || Array.isArray(manifest.scripts)) return [];

  const runner = nodeScriptRunner(manifest, files);
  const kinds = [
    [/^test(?::[a-z0-9:_-]+)?$/i, "test"],
    [/^(?:lint|eslint)(?::[a-z0-9:_-]+)?$/i, "lint"],
    [/^(?:typecheck|type-check|tsc)(?::[a-z0-9:_-]+)?$/i, "typecheck"],
    [/^(?:check|verify)(?::[a-z0-9:_-]+)?$/i, "verification"],
    [/^(?:format:check|prettier:check)$/i, "format-check"],
    [/^build(?::[a-z0-9:_-]+)?$/i, "build"]
  ];

  return Object.keys(manifest.scripts)
    .sort()
    .filter((name) => /^[a-z0-9:_-]+$/i.test(name))
    .map((name) => ({ name, kind: kinds.find(([pattern]) => pattern.test(name))?.[1] }))
    .filter(({ kind }) => Boolean(kind))
    .map(({ name, kind }) => ({
      command: `${runner} ${name}`,
      kind,
      source: `${manifestPath}#scripts.${name}`,
      workingDirectory: path.posix.dirname(manifestPath) === "." ? "workspace root" : `${path.posix.dirname(manifestPath)}/`,
      evidence: "declared-script-name"
    }));
}

function generatedFileHints(files) {
  return asList(files).filter((file) =>
    /(?:^|\/)(?:generated|gen)\//i.test(file)
    || /(?:\.generated\.|\.g\.|\.designer\.|\.freezed\.dart$)/i.test(file)
    || file === "next-env.d.ts"
  );
}

/**
 * Produce a redacted, local-only evidence model for an AGENTS.md. It deliberately
 * keeps manifest command bodies out of the result: a script name is enough to
 * provide a safe command invocation without copying arbitrary shell text into an
 * instruction file.
 */
export function createAgentGuideEvidence(files, { packageJson, packageManifests = [] } = {}) {
  const normalized = [...new Set(asList(files))].sort();
  const configuration = configurationInventory(normalized);
  const sourceRoots = presentRepositoryRoots(normalized, SOURCE_ROOT_NAMES);
  const testRoots = presentRepositoryRoots(normalized, TEST_ROOT_NAMES);
  const documentationRoots = presentRepositoryRoots(normalized, DOCUMENTATION_ROOT_NAMES);
  const manifestPaths = normalized.filter((file) => MANIFEST_NAMES.has(path.posix.basename(file)) || file.endsWith(".csproj"));
  const lockfiles = normalized.filter((file) => LOCKFILE_NAMES.has(path.posix.basename(file)));
  const nodeManifests = packageManifests.length
    ? packageManifests
    : packageJson ? [{ path: "package.json", content: packageJson }] : [];
  const commands = nodeManifests.flatMap(({ path: manifestPath, content }) =>
    declaredNodeVerificationCommands(content, normalized, manifestPath)
  );
  const missing = [];
  if (!sourceRoots.length) missing.push("source-roots");
  if (!commands.length) missing.push("declared-verification-commands");

  return {
    schemaVersion: 1,
    source: "local-workspace-inventory",
    repositoryMap: {
      sourceRoots,
      testRoots,
      documentationRoots,
      manifestPaths,
      existingGuidePaths: [...configuration.rootAgents, ...configuration.nestedAgents]
    },
    verification: {
      commands,
      policy: "Only declared package-script names are emitted; script bodies and unverified commands are omitted."
    },
    boundaries: {
      lockfiles,
      generatedFileHints: generatedFileHints(normalized)
    },
    missing,
    privacy: "Derived only from local paths and manifest metadata. Source contents, environment values, and script bodies are not included."
  };
}

function markdownPathList(paths, label) {
  return paths.length ? `- ${label}: ${paths.map((entry) => `\`${entry}\``).join(", ")}` : "";
}

function commandPurpose(kind) {
  return {
    test: "run the declared test check",
    lint: "run the declared lint check",
    typecheck: "run the declared type check",
    verification: "run the declared verification check",
    "format-check": "run the declared formatting check",
    build: "run the declared build check"
  }[kind] || "run a declared project check";
}

function codingConventionLines(agentsDecision = {}) {
  const codingStyle = agentsDecision.codingStyle || "existing-patterns";
  const functionDesign = agentsDecision.functionDesign || "single-responsibility";
  const commentStyle = agentsDecision.commentStyle || "why-and-invariants";
  const lines = [];

  if (codingStyle === "modular-boundaries") {
    lines.push("- Keep public module contracts narrow. Place domain decisions behind the selected architecture's module boundaries, and keep framework or transport code at adapters.");
  } else if (codingStyle === "functional-core") {
    lines.push("- Prefer a functional core for domain decisions: keep calculations deterministic and immutable where practical, and keep I/O, framework calls, and mutation at explicit boundaries.");
  } else if (codingStyle === "custom" && agentsDecision.comment) {
    lines.push(`- Project-specific coding policy: ${agentsDecision.comment}`);
  } else {
    lines.push("- Follow the closest established local pattern before introducing a new one. Where no local precedent exists, use the selected language and framework's idiomatic conventions.");
  }

  if (functionDesign === "separate-effects") {
    lines.push("- Separate orchestration and side effects from domain logic. Keep database, network, filesystem, process, and UI-state effects behind focused boundaries.");
  } else if (functionDesign === "custom" && agentsDecision.comment && codingStyle !== "custom") {
    lines.push(`- Project-specific function-design policy: ${agentsDecision.comment}`);
  } else {
    lines.push("- Give each function one clear responsibility and a consistent level of abstraction. Split mixed calculation, I/O, state-change, and rendering concerns when that makes the contract clearer; do not split only to reduce line count.");
  }

  if (commentStyle === "minimal") {
    lines.push("- Prefer clear names and small interfaces to explanatory comments. Keep comments only for non-obvious context that code cannot express.");
  } else if (commentStyle === "custom" && agentsDecision.comment && codingStyle !== "custom" && functionDesign !== "custom") {
    lines.push(`- Project-specific comment policy: ${agentsDecision.comment}`);
  } else {
    lines.push("- Write comments for rationale, constraints, and non-obvious invariants; do not restate implementation mechanics that the code already makes clear.");
  }

  return lines;
}

/**
 * Turn inventory evidence into reviewed template values. This is a preview only;
 * the Skill still requires an exact file-plan approval before it renders AGENTS.md.
 */
export function createAgentsGuideBlueprint(inventory = {}, agentsDecision = {}) {
  const evidence = inventory.agentGuideEvidence || createAgentGuideEvidence(inventory.files || []);
  const map = evidence.repositoryMap;
  const mapLines = [
    markdownPathList(map.sourceRoots, "Source areas"),
    markdownPathList(map.testRoots, "Test areas"),
    markdownPathList(map.documentationRoots, "Documentation and examples"),
    markdownPathList(map.manifestPaths, "Build and dependency manifests")
  ].filter(Boolean);
  if (!mapLines.length) {
    mapLines.push("- No conventional source, test, documentation, or manifest path was detected. Confirm the repository map before adding project-specific instructions.");
  }

  const verificationLines = evidence.verification.commands.map(({ command, kind, source, workingDirectory }) =>
    `- \`${command}\` from \`${workingDirectory}\` — ${commandPurpose(kind)} (declared by \`${source}\`).`
  );
  if (!verificationLines.length) {
    verificationLines.push("- No declared verification command was detected. Ask for the repository's approved command before adding or running one.");
  }

  const boundaryLines = [];
  if (evidence.boundaries.lockfiles.length) {
    boundaryLines.push(`- Treat ${evidence.boundaries.lockfiles.map((file) => `\`${file}\``).join(", ")} as package-manager-owned lockfiles; update them only through an approved dependency command.`);
  }
  if (evidence.boundaries.generatedFileHints.length) {
    boundaryLines.push(`- The inventory found generated-file hints: ${evidence.boundaries.generatedFileHints.map((file) => `\`${file}\``).join(", ")}. Confirm the owning generator before editing these paths.`);
  }
  if (!boundaryLines.length) {
    boundaryLines.push("- No lockfile or generated-file hint was detected. Do not declare generated-code ownership without local evidence.");
  }

  const candidateScopes = [...new Set([...map.sourceRoots, ...map.testRoots])];
  const localGuidance = agentsDecision.localScope === "nested-where-needed"
    ? `- Keep this guide as the shared root policy. Do not generate nested \`AGENTS.md\` files until an area has genuinely different rules; likely review candidates are ${candidateScopes.length ? candidateScopes.map((candidate) => `\`${candidate}\``).join(", ") : "not yet detected"}.`
    : "- Keep guidance at the repository root. Add a nested `AGENTS.md` only after a project-specific rule differs from this guide; do not duplicate root instructions.";

  const reviewRules = [
    "- Add a project-specific review rule only for a confirmed, consequential, non-obvious invariant. State its scope, the invariant to preserve, and the smallest safe path.",
    "- Keep formatting and other mechanical checks in declared tooling or CI. Do not turn them into broad AGENTS.md review rules.",
    "- Keep public contracts and data boundaries backward-compatible unless a reviewed decision explicitly approves a change."
  ];

  return {
    schemaVersion: 2,
    source: evidence.source,
    status: evidence.missing.length ? "needs-confirmation" : "grounded",
    evidence,
    templateValues: {
      repositoryMap: mapLines.join("\n"),
      verificationCommands: verificationLines.join("\n"),
      boundaries: boundaryLines.join("\n"),
      localGuidance,
      codingConventions: codingConventionLines(agentsDecision).join("\n"),
      reviewRules: reviewRules.join("\n")
    },
    review: {
      required: true,
      message: "Review the detected paths and declared command names. Correct or confirm them before approving AGENTS.md generation.",
      missingEvidence: evidence.missing
    }
  };
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

function detectNodeLanguage(packageJson, files) {
  if (!packageJson) return undefined;
  const hasTypeScriptSource = files.some((file) => /\.(?:ts|tsx|mts|cts)$/.test(file));
  try {
    const manifest = JSON.parse(packageJson);
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies };
    if (hasTypeScriptSource || Object.hasOwn(dependencies, "typescript")) return "typescript";
  } catch {
    if (hasTypeScriptSource) return "typescript";
  }
  return "javascript";
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
  const workspaceConfiguration = configurationInventory(files);
  const packageJson = await readTextIfExists(path.join(workspace, "package.json"));
  const packageManifestPaths = files.filter((file) => file === "package.json" || file.endsWith("/package.json"));
  const packageManifests = await Promise.all(packageManifestPaths.slice(0, 100).map(async (relativePath) => ({
    path: relativePath,
    content: await readTextIfExists(path.join(workspace, relativePath))
  })));
  const pyproject = await readTextIfExists(path.join(workspace, "pyproject.toml"));
  const goMod = await readTextIfExists(path.join(workspace, "go.mod"));
  const pom = await readTextIfExists(path.join(workspace, "pom.xml"));
  const gradle = await readTextIfExists(path.join(workspace, "build.gradle.kts"));
  const csproj = files.find((file) => file.endsWith(".csproj"));
  const pubspec = await readTextIfExists(path.join(workspace, "pubspec.yaml"));

  const languages = [];
  const nodeLanguage = detectNodeLanguage(packageJson, files);
  if (nodeLanguage) languages.push(nodeLanguage);
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
  const agentGuideEvidence = createAgentGuideEvidence(files, { packageJson, packageManifests });

  return {
    root: workspace,
    accessScope: workspaceAccessScope(),
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
    configuration: workspaceConfiguration,
    agentGuideEvidence,
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

function planRuntimeScaffolds(selectedIds, inventory, projectName) {
  const selected = new Set(selectedIds);
  const files = new Set(asList(inventory.files));
  if (!selected.has("language.flutter")) return [];

  const flutterAlreadyExists = ["pubspec.yaml", "lib/main.dart", "android/"]
    .some((entry) => files.has(entry) || files.has(entry.replace(/\/$/, "")) || [...files].some((file) => file.startsWith(entry)));
  if (flutterAlreadyExists) {
    return [{
      runtime: "flutter",
      operation: "not-needed",
      reason: "A Flutter project scaffold is already present; preserve it and do not run flutter create.",
      expectedPaths: FLUTTER_STANDARD_PATHS,
      approvalRequired: true
    }];
  }

  const normalizedName = normalizeFlutterProjectName(projectName);
  return [{
    runtime: "flutter",
    operation: "generate",
    command: `flutter create --no-pub --project-name ${normalizedName} .`,
    workingDirectory: "workspace root",
    purpose: "Generate the standard Flutter project structure used by Flutter tooling and Android Studio without fetching packages.",
    expectedPaths: FLUTTER_STANDARD_PATHS,
    networkEffect: "No dependency fetch is requested because --no-pub is used; the locally installed Flutter SDK supplies the templates.",
    approvalRequired: true
  }];
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
  if (inventory.truncated) {
    const completeInventoryValidation = {
      ...validation,
      status: "block",
      messages: [...validation.messages, {
        status: "block",
        code: "incomplete-workspace-inventory",
        message: "The workspace inventory is truncated. Re-inspect with enough depth and file capacity before planning file changes."
      }]
    };
    return blockedPlan(completeInventoryValidation, "A complete workspace inventory is required before planning local configuration changes.");
  }

  const normalizedWorkspaceSettings = normalizeWorkspaceSettings(workspaceSettings);
  const normalizedGuideDecisions = normalizeGuideDecisions(guideDecisions, {
    allowPullRequest: normalizedWorkspaceSettings.collaborationHost === "github"
  });
  const agentsGuide = createAgentsGuideBlueprint(inventory, normalizedGuideDecisions.agents);
  const artifacts = [...COMMON_ARTIFACTS];
  for (const id of selectedIds) {
    artifacts.push(...(ADAPTER_ARTIFACTS[id] || []));
    artifacts.push(...(DELIVERY_ARTIFACTS[id] || []));
  }
  if (normalizedWorkspaceSettings.collaborationHost === "github" && normalizedGuideDecisions.pullRequest) {
    artifacts.push([".github/pull_request_template.md", "pull-request-template"]);
  }
  const deduplicated = new Map(artifacts.map(([file, template]) => [file, template]));
  const plans = [...deduplicated].map(([file, template]) => artifactOperation(file, template, inventory));
  const scaffolds = planRuntimeScaffolds(selectedIds, inventory, projectName || requirements.projectName);
  const scaffoldCommands = scaffolds
    .filter((scaffold) => scaffold.operation === "generate")
    .map(({ command, workingDirectory, purpose, expectedPaths, networkEffect, approvalRequired }) => ({
      command,
      workingDirectory,
      purpose,
      expectedPaths,
      networkEffect,
      approvalRequired
    }));

  const requiresReview = validation.status === "warning" || plans.some((plan) => plan.operation === "merge-preview");
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
