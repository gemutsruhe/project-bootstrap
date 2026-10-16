import path from "node:path";

const posix = path.posix;
const unique = (values) => [...new Set(values)].sort();
const sourceNames = new Set(["src", "app", "apps", "packages", "lib", "server", "services", "client", "backend", "frontend", "web", "mobile", "cmd", "internal", "pkg", "pipelines", "notebooks", "Sources", "android", "ios", "macos", "windows", "linux", "modules"]);
const testNames = new Set(["test", "tests", "Tests", "__tests__", "spec", "specs", "e2e", "integration", "integration_test", "androidTest", "evals", "evaluations"]);
const documentationNames = new Set(["docs", "doc", "documentation", "examples"]);
const dataNames = new Set(["data", "datasets", "prompts", "fixtures", "migrations"]);
const lockNames = new Set(["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "poetry.lock", "uv.lock", "Pipfile.lock", "pubspec.lock", "packages.lock.json", "Cargo.lock", "Package.resolved", ".terraform.lock.hcl", "gradle.lockfile"]);
const managerLocks = { npm: ["package-lock.json", "npm-shrinkwrap.json"], pnpm: ["pnpm-lock.yaml"], yarn: ["yarn.lock"], bun: ["bun.lock", "bun.lockb"] };

// Unsupported runtimes still get a detected area and an explicit coverage gap.
export const RUNTIME_ADAPTERS = Object.freeze([
  { id: "node", manifests: /(^|\/)package\.json$/, supported: true },
  { id: "python", manifests: /(^|\/)(?:pyproject\.toml|requirements(?:-dev)?\.txt|setup\.cfg|Pipfile)$/, supported: true },
  { id: "go", manifests: /(^|\/)go\.mod$/, supported: true },
  { id: "maven", manifests: /(^|\/)pom\.xml$/, supported: true },
  { id: "gradle", manifests: /(^|\/)(?:build|settings)\.gradle(?:\.kts)?$/, supported: true },
  { id: "dotnet", manifests: /\.(?:csproj|fsproj|vbproj)$/, supported: true },
  { id: "dart", manifests: /(^|\/)pubspec\.yaml$/, supported: false },
  { id: "rust", manifests: /(^|\/)Cargo\.toml$/, supported: false },
  { id: "swift", manifests: /(^|\/)Package\.swift$|\.xcodeproj\/project\.pbxproj$/, supported: false },
  { id: "terraform", manifests: /\.tf$/, supported: false }
]);

export function isAgentMetadataPath(file) {
  return RUNTIME_ADAPTERS.some((adapter) => adapter.manifests.test(file))
    || /(^|\/)(?:global\.json|pytest\.ini|tox\.ini|Makefile|Taskfile\.ya?ml|\.node-version|\.python-version|pnpm-workspace\.yaml)$/.test(file)
    || /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file);
}

function roots(files, names) {
  return unique(files.flatMap((file) => {
    const parts = file.split("/");
    return parts.slice(0, -1).flatMap((part, index) => names.has(part) ? [parts.slice(0, index + 1).join("/") + "/"] : []);
  }));
}

function json(content) {
  try { const value = JSON.parse(content); return value && typeof value === "object" && !Array.isArray(value) ? value : undefined; } catch { return undefined; }
}

function unquote(value) { return value.trim().replace(/^(['"])(.*)\1$/, "$2"); }

// Recognise a bounded YAML dependency mapping, not arbitrary occurrences of sdk.
// Unsupported aliases/tags remain unconfirmed instead of being guessed.
export function hasFlutterSdk(content) {
  if (typeof content !== "string") return false;
  let section = false;
  let sectionIndent;
  let dependencyIndent;
  let childIndent;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "");
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (/^\S/.test(line)) {
      section = /^dependencies\s*:\s*$/.test(line);
      sectionIndent = undefined;
      dependencyIndent = undefined;
      childIndent = undefined;
      if (/^dependencies\s*:\s*\{\s*flutter\s*:\s*\{\s*sdk\s*:\s*['"]?flutter['"]?\s*\}\s*\}\s*$/.test(line)) return true;
      continue;
    }
    if (!section) continue;
    const indent = line.match(/^ */)[0].length;
    if (sectionIndent === undefined) sectionIndent = indent;
    if (dependencyIndent !== undefined && indent <= dependencyIndent) dependencyIndent = undefined;
    const dependency = line.match(/^\s+['"]?flutter['"]?\s*:\s*(.*)$/);
    if (dependency && indent === sectionIndent) {
      if (/^\{\s*sdk\s*:\s*['"]?flutter['"]?\s*\}\s*$/.test(dependency[1])) return true;
      if (!dependency[1].trim()) { dependencyIndent = indent; childIndent = undefined; }
    } else if (dependencyIndent !== undefined && indent > dependencyIndent) {
      if (childIndent === undefined) childIndent = indent;
      const sdk = line.match(/^\s+sdk\s*:\s*(.*?)\s*$/);
      if (sdk && indent === childIndent && unquote(sdk[1]) === "flutter") return true;
    }
  }
  return false;
}

function cwd(directory) { return directory === "." ? "workspace root" : `${directory}/`; }
function within(file, directory) { return directory === "." || file.startsWith(directory + "/"); }
function scoped(directory, name) { return directory === "." ? name : `${directory}/${name}`; }

function resolveManager(directory, manifest, files, manifests) {
  const warnings = [];
  let current = directory;
  while (true) {
    const record = current === directory ? manifest : json(manifests.get(scoped(current, "package.json")));
    const explicit = record?.packageManager;
    const locks = Object.entries(managerLocks).filter(([, names]) => names.some((name) => files.includes(scoped(current, name)))).map(([name]) => name);
    if (explicit !== undefined) {
      const match = typeof explicit === "string" && explicit.match(/^(npm|pnpm|yarn|bun)@[^\s]+$/);
      if (!match) return { warnings: [{ code: "unknown-package-manager", directory: current }] };
      if (locks.some((name) => name !== match[1])) warnings.push({ code: "package-manager-lock-conflict", directory: current, selected: match[1], detected: locks });
      return { name: match[1], source: scoped(current, "package.json") + "#packageManager", warnings };
    }
    if (locks.length > 1) return { warnings: [{ code: "ambiguous-package-manager", directory: current, detected: locks }] };
    if (locks.length === 1) return { name: locks[0], source: scoped(current, managerLocks[locks[0]].find((name) => files.includes(scoped(current, name)))), warnings };
    if (current === ".") break;
    current = posix.dirname(current);
  }
  return { name: "npm", source: "Node package-script fallback (no manager declared)", warnings };
}

export function commandEffects(text, kind) {
  const effects = ["unknown"];
  if (/(?:watch|--watch|--watchAll|--ui|\bserve\b)/i.test(text)) effects.push("persistent");
  if (/(?:\bfix\b|--write|\bformat\b(?!:check)|\bbuild\b)/i.test(text) && !/format:check/.test(text)) effects.push("writes-files");
  if (/(?:\blive\b|\bproduction\b|\bstaging\b)/i.test(text)) effects.push("live-system");
  if (/(?:\bpublish\b|\bdeploy\b|\brelease\b)/i.test(text)) effects.push("publishes");
  if (/(?:\binstall\b|\brestore\b|\baudit\b|\bnpx\b|\buv run\b)/i.test(text)) effects.push("network");
  if (/(?:connected.*Test|\bdevice\b|\bemulator\b)/i.test(text)) effects.push("device");
  if (kind === "build" && !effects.includes("writes-files")) effects.push("writes-files");
  return effects;
}

function commandRecord(command, kind, source, directory, evidence, effects = ["unknown"]) {
  return {
    command, kind, source, workingDirectory: cwd(directory), directory, evidence,
    effects, requiresReview: true, executionStatus: "not-run",
    suitableForVerification: !effects.some((effect) => ["persistent", "live-system", "publishes", "device"].includes(effect))
  };
}

function nodeCommands(file, manifest, files, manifests, warnings) {
  const directory = posix.dirname(file);
  const manager = resolveManager(directory, manifest, files, manifests);
  warnings.push(...manager.warnings);
  if (!manager.name || !manifest?.scripts || typeof manifest.scripts !== "object" || Array.isArray(manifest.scripts)) return [];
  const kinds = [[/^test(?::[\w:-]+)?$/i, "test"], [/^(lint|eslint)(?::[\w:-]+)?$/i, "lint"], [/^(typecheck|type-check|tsc)(?::[\w:-]+)?$/i, "typecheck"], [/^(check|verify)(?::[\w:-]+)?$/i, "verification"], [/^(format:check|prettier:check)$/i, "format-check"], [/^build(?::[\w:-]+)?$/i, "build"]];
  const runner = { npm: "npm run", pnpm: "pnpm run", yarn: "yarn", bun: "bun run" }[manager.name];
  return Object.entries(manifest.scripts).sort(([a], [b]) => a.localeCompare(b)).flatMap(([name, body]) => {
    const kind = kinds.find(([pattern]) => pattern.test(name))?.[1];
    if (!kind || !/^[a-z0-9:_-]+$/i.test(name) || typeof body !== "string" || !body.trim()) return [];
    const effects = commandEffects(`${name} ${body}`, kind);
    const result = commandRecord(`${runner} ${name}`, kind, `${file}#scripts.${name}`, directory, "declared-script-name", effects);
    // Fixers are valid declared commands, but not the default verification path.
    if (/(?:^|:)fix(?:$|:)|--fix\b|--write\b/.test(`${name} ${body}`)) result.suitableForVerification = false;
    return [{ ...result, runtime: "node", packageManager: { name: manager.name, source: manager.source } }];
  });
}

function standardCommands(area, manifests, files, platform) {
  const commands = [];
  const local = (name) => manifests.get(scoped(area.directory, name)) || "";
  const has = (name) => files.includes(scoped(area.directory, name));
  const add = (command, kind, source, effects = ["unknown", "writes-files"]) => commands.push(commandRecord(command, kind, source, area.directory, "supported-runtime-manifest", effects));
  const source = area.manifests[0];
  if (area.runtime === "flutter") {
    const flutterSource = scoped(area.directory, "pubspec.yaml") + "#dependencies.flutter";
    add("flutter analyze", "flutter-analyze", flutterSource, ["unknown", "network"]);
    add("flutter test", "flutter-test", flutterSource, ["unknown", "writes-files", "network"]);
    commands.forEach((command) => { command.evidence = "declared-flutter-sdk"; });
  } else if (area.runtime === "python") {
    const pyproject = local("pyproject.toml");
    const requirements = [local("requirements.txt"), local("requirements-dev.txt")].join("\n");
    if (/^\s*\[tool\.pytest\.ini_options\]/m.test(pyproject) || has("pytest.ini") || /^pytest(?:[<>=!~\[\s]|$)/m.test(requirements)) {
      add("python -m pytest", "test", has("pytest.ini") ? scoped(area.directory, "pytest.ini") : source);
    }
    if (/^\s*\[tool\.ruff(?:\.|\])/m.test(pyproject)) add("python -m ruff check .", "lint", scoped(area.directory, "pyproject.toml") + "#tool.ruff");
    if (/^\s*\[tool\.mypy\]/m.test(pyproject)) add("python -m mypy .", "typecheck", scoped(area.directory, "pyproject.toml") + "#tool.mypy");
  } else if (area.runtime === "go" && /^module\s+\S+/m.test(local("go.mod"))) {
    add("go test ./...", "test", source, ["unknown", "writes-files", "network"]);
    add("go vet ./...", "lint", source, ["unknown", "network"]);
  } else if (area.runtime === "maven") {
    const wrapper = platform === "win32" ? "mvnw.cmd" : "mvnw";
    if (has(wrapper)) add(`${platform === "win32" ? ".\\" : "./"}${wrapper} test`, "test", source, ["unknown", "network", "writes-files"]);
  } else if (area.runtime === "gradle") {
    const wrapper = platform === "win32" ? "gradlew.bat" : "gradlew";
    const build = local("build.gradle") + "\n" + local("build.gradle.kts");
    // Android variants/device tasks and arbitrary Gradle plugins need declared tasks.
    if (has(wrapper) && !/com\.android\./.test(build) && /(?:id\s*\(?\s*["'](?:java|java-library|org\.jetbrains\.kotlin\.jvm)["']|kotlin\s*\(\s*["']jvm["']|apply\s+plugin:\s*["']java["'])/.test(build)) {
      add(`${platform === "win32" ? ".\\" : "./"}${wrapper} test`, "test", source, ["unknown", "network", "writes-files"]);
    }
  } else if (area.runtime === "dotnet") {
    for (const file of area.manifests) {
      const content = manifests.get(file) || "";
      const name = posix.basename(file);
      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) continue;
      add(`dotnet build ${name} --no-restore`, "build", file);
      if (/<IsTestProject>\s*true\s*<\/IsTestProject>|Microsoft\.NET\.Test\.Sdk/.test(content)) add(`dotnet test ${name} --no-restore`, "test", file);
    }
  }
  return commands.map((command) => ({ ...command, runtime: area.runtime }));
}

// CI is evidence, not a shell interpreter. Only literal, bounded check invocations
// are copied; expressions, compound commands, and ambiguous working directories
// remain a visible confirmation item.
function ciCommands(file, content, warnings) {
  if (!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(file)) return [];
  const commands = [];
  const allowed = /^(?:(?:python(?:3)? -m |uv run (?:--no-sync )?|poetry run )pytest(?: [\w./-]+)*|(?:python(?:3)? -m )?ruff check [\w./-]+|go (?:test|vet) [\w./-]+|flutter (?:analyze|test)(?: [\w./-]+)*|(?:\.\/|\.\\)(?:gradlew(?:\.bat)?|mvnw(?:\.cmd)?) (?:test|check|verify|lint|test\w*UnitTest|connected\w*AndroidTest)|dotnet (?:test|build)(?: [\w./-]+)*|(?:npm run|pnpm run|bun run|yarn) [a-zA-Z0-9:_-]+)$/;
  if (/\bdefaults\s*:|\bworking-directory\s*:/.test(content)) {
    warnings.push({ code: "ci-working-directory-needs-review", path: file });
    return commands;
  }
  for (const line of String(content).split(/\r?\n/)) {
    const run = line.match(/^\s*(?:-\s*)?run:\s*(.+?)\s*$/);
    if (!run) continue;
    const command = unquote(run[1]);
    if (!allowed.test(command)) { warnings.push({ code: "ci-command-needs-review", path: file }); continue; }
    const effects = commandEffects(command, "verification");
    const runtime = /^(?:python|python3|uv|poetry|ruff)\b/.test(command) ? "python" : command.startsWith("go ") ? "go" : command.startsWith("flutter ") ? "flutter" : command.startsWith("dotnet ") ? "dotnet" : command.includes("gradlew") ? "gradle" : command.includes("mvnw") ? "maven" : "node";
    const kind = /(?:pytest|\btest\b|UnitTest|AndroidTest)/.test(command) ? "test" : /(?:\bvet\b|\blint\b|\bruff\b|\banalyze\b)/.test(command) ? "lint" : "verification";
    commands.push({ ...commandRecord(command, kind, file + "#run", ".", "declared-ci-check", effects), runtime });
  }
  return commands;
}

export function createAgentGuideEvidence(files = [], { packageJson, packageManifests = [], pubspec, pubspecManifests = [], manifests = [], skippedDirectories = [], collection = {}, platform = process.platform } = {}) {
  const normalized = unique(files);
  const contents = new Map(manifests.map((record) => [record.path, record.content]));
  for (const record of [...packageManifests, ...pubspecManifests]) contents.set(record.path, record.content);
  if (packageJson !== undefined && !contents.has("package.json")) contents.set("package.json", packageJson);
  if (pubspec !== undefined && !contents.has("pubspec.yaml")) contents.set("pubspec.yaml", pubspec);
  const warnings = [];
  const grouped = new Map();
  const nodeCapabilities = { expo: [], sdk: [] };
  for (const file of normalized) {
    const adapter = RUNTIME_ADAPTERS.find((entry) => entry.manifests.test(file));
    if (!adapter) continue;
    const directory = file.endsWith("/project.pbxproj") ? posix.dirname(posix.dirname(file)) : posix.dirname(file);
    const runtime = adapter.id === "dart" && hasFlutterSdk(contents.get(file)) ? "flutter" : adapter.id;
    const key = `${directory}:${runtime}`;
    if (!grouped.has(key)) grouped.set(key, { directory, runtime, supported: runtime === "flutter" || adapter.supported, manifests: [] });
    grouped.get(key).manifests.push(file);
    if (runtime === "node") {
      const manifest = json(contents.get(file));
      if (manifest?.dependencies?.expo || manifest?.devDependencies?.expo) nodeCapabilities.expo.push(directory);
      if (manifest?.exports && manifest.private !== true) nodeCapabilities.sdk.push(directory);
    }
  }
  const areas = [...grouped.values()];
  const commands = [];
  for (const area of areas) {
    if (area.runtime === "node") for (const file of area.manifests) commands.push(...nodeCommands(file, json(contents.get(file)), normalized, contents, warnings));
    else commands.push(...standardCommands(area, contents, normalized, platform));
  }
  for (const [file, content] of contents) if (typeof content === "string") {
    commands.push(...ciCommands(file, content, warnings));
    if (posix.basename(file) === "Makefile") {
      for (const match of content.matchAll(/^(test|check|lint|verify|typecheck)(?:[ \t]*):([^=].*)?$/gm)) {
        commands.push(commandRecord(`make ${match[1]}`, "verification", file + "#" + match[1], posix.dirname(file), "declared-make-target"));
      }
    }
  }
  const byCommand = new Map();
  for (const command of commands) {
    const key = `${command.directory}:${command.command}`;
    const existing = byCommand.get(key);
    if (existing) {
      existing.effects = [...new Set([...existing.effects, ...command.effects])];
      existing.suitableForVerification = existing.suitableForVerification && command.suitableForVerification;
    } else if (command.evidence === "declared-ci-check" && command.runtime === "node") {
      // Package-manager choice and script effects come from the owning manifest.
      // A differently invoked CI script cannot bypass that evidence.
      warnings.push({ code: "ci-package-command-needs-review", path: command.source.split("#")[0] });
    } else byCommand.set(key, command);
  }
  const dedupedCommands = [...byCommand.values()];
  for (const area of areas) {
    const ownedFiles = normalized.filter((file) => within(file, area.directory) && !areas.some((child) => child.directory !== area.directory && within(child.directory, area.directory) && within(file, child.directory)));
    area.configurationOnly = area.runtime === "node" && ownedFiles.every((file) => !/\.(?:[cm]?[jt]sx?)$/.test(file)) && areas.some((child) => child.directory !== area.directory && within(child.directory, area.directory));
    area.commandCount = dedupedCommands.filter((command) => command.directory === area.directory && command.runtime === area.runtime && command.suitableForVerification).length;
    area.status = !area.supported ? "unsupported" : area.commandCount ? "declared" : area.configurationOnly ? "configuration-only" : "needs-confirmation";
    area.testEvidence = dedupedCommands.some((command) => command.directory === area.directory && command.runtime === area.runtime && command.suitableForVerification && ["test", "flutter-test"].includes(command.kind));
  }
  const sourceRoots = roots(normalized, sourceNames);
  const testRoots = unique([...roots(normalized, testNames), ...normalized.filter((file) => /(?:_test\.go|(?:\.test|\.spec)\.[cm]?[jt]sx?)$/.test(file)).map((file) => posix.dirname(file) + "/")]);
  const generated = normalized.filter((file) => /(?:^|\/)(?:generated|gen)\/|(?:\.generated\.|\.g\.|\.designer\.|\.freezed\.dart$)|(?:^|\/)next-env\.d\.ts$/i.test(file));
  const outputDirectories = skippedDirectories.filter((directory) => /(?:^|\/)(?:dist|build|out|target|bin|obj)\/$/.test(directory));
  const missing = [];
  if (!sourceRoots.length) missing.push("source-roots");
  if (!dedupedCommands.some((command) => command.suitableForVerification)) missing.push("declared-verification-commands");
  for (const area of areas) if (["unsupported", "needs-confirmation"].includes(area.status)) missing.push(`${area.status}:${area.directory}:${area.runtime}`);
  if (collection.complete === false) missing.push("incomplete-manifest-evidence");
  if (warnings.some((warning) => /package-manager/.test(warning.code))) missing.push("package-manager-review");
  const languages = [];
  for (const area of areas) {
    if (area.runtime === "node") {
      const typed = normalized.some((file) => within(file, area.directory) && /\.(?:ts|tsx|mts|cts)$/.test(file)) || area.manifests.some((file) => { const m = json(contents.get(file)); return m?.dependencies?.typescript || m?.devDependencies?.typescript; });
      languages.push(typed ? "typescript" : "javascript");
    } else if (["maven", "gradle"].includes(area.runtime)) {
      const java = normalized.some((file) => within(file, area.directory) && file.endsWith(".java"));
      const kotlin = normalized.some((file) => within(file, area.directory) && file.endsWith(".kt"));
      if (java) languages.push("java");
      if (kotlin) languages.push("kotlin");
      if (!java && !kotlin) languages.push("jvm");
    } else languages.push(area.runtime);
  }
  for (const [pattern, language] of [[/\.py$/, "python"], [/\.go$/, "go"], [/\.java$/, "java"], [/\.kt$/, "kotlin"], [/\.cs$/, "dotnet"], [/\.rs$/, "rust"], [/\.swift$/, "swift"]]) {
    if (normalized.some((file) => pattern.test(file))) languages.push(language);
  }
  if (!areas.some((area) => area.runtime === "flutter") && normalized.some((file) => file.endsWith(".dart"))) languages.push("dart");
  return {
    schemaVersion: 2, source: "local-workspace-inventory", languages: unique(languages), capabilities: nodeCapabilities,
    repositoryMap: {
      sourceRoots, testRoots, documentationRoots: roots(normalized, documentationNames), dataRoots: roots(normalized, dataNames),
      manifestPaths: unique([...areas.flatMap((area) => area.manifests), ...normalized.filter((file) => /(^|\/)global\.json$|\.slnx?$/.test(file))]),
      existingGuidePaths: normalized.filter((file) => /(^|\/)AGENTS(?:\.override)?\.md$/.test(file))
    },
    verification: { commands: dedupedCommands, areas, warnings, collection, policy: "Declarations are not execution results or safety guarantees. Inspect prerequisites and effects before running; script bodies and environment values are not emitted." },
    boundaries: { lockfiles: normalized.filter((file) => lockNames.has(posix.basename(file))), managedDependencyFiles: normalized.filter((file) => posix.basename(file) === "go.sum"), generatedFileHints: generated, outputDirectories },
    missing: unique(missing), privacy: "Local paths and redacted manifest metadata only. No source text, script bodies, environment values, or credentials are returned."
  };
}
