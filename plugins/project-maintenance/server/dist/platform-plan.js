import { PLATFORM_CATALOG, PLATFORM_CATALOG_VERSION } from "./platform-catalog.js";
import { validatePlatformSelection } from "./platform-selection.js";
import { renderPlatformRecipe } from "./platform-recipes.js";

function optionEvidence(target) {
  return Object.entries(target.choices).flatMap(([slot, selected]) => {
    const definition = PLATFORM_CATALOG[target.platformId]?.slots[slot];
    return (Array.isArray(selected) ? selected : [selected]).map((id) => {
      const candidate = definition?.options.find((item) => item.id === id);
      return { targetId: target.id, slot, id, reason: candidate?.reason, versionBaseline: candidate?.versionBaseline, generation: candidate?.generation, sources: candidate?.evidence || [] };
    });
  });
}

export function createPlatformPlan(selection, { inventory = {}, hostPlatform, requirements = {} } = {}) {
  const validation = validatePlatformSelection(selection, { inventory, hostPlatform, requirements });
  if (validation.status === "block") return { status: "blocked", validation, selection: null, artifacts: [], commands: [], checks: [] };
  if (inventory.truncated || inventory.agentGuideEvidence?.verification?.collection?.complete === false) return {
    status: "blocked", validation: { ...validation, status: "block", messages: [...validation.messages, { status: "block", code: "incomplete-workspace-inventory", message: "Re-inspect the workspace before planning file changes." }] },
    selection: null, artifacts: [], commands: [], checks: []
  };
  if (validation.targets.some((target) => target.customChoices.length)) return {
    status: "needs-custom-research", validation, selection: { version: 2, catalogVersion: PLATFORM_CATALOG_VERSION, targets: validation.targets },
    artifacts: [], commands: [], checks: [],
    message: "Obtain permission to look up official docs or package registries, then present an evidence-backed integration for separate file and command approval. Do not infer a runnable recipe from a name alone."
  };
  const conditional = validation.targets.flatMap((target) => Object.entries(target.choices).flatMap(([slot, selected]) => {
    const definition = PLATFORM_CATALOG[target.platformId]?.slots[slot];
    return (Array.isArray(selected) ? selected : [selected]).filter((id) => definition?.options.find((candidate) => candidate.id === id)?.generation === "conditional-review")
      .map((id) => ({ targetId: target.id, slot, id }));
  }));
  if (conditional.length) return {
    status: "needs-integration-review", validation,
    selection: { version: 2, catalogVersion: PLATFORM_CATALOG_VERSION, targets: validation.targets },
    conditional, artifacts: [], commands: [], checks: [],
    message: "Review provider/host configuration and a platform-specific integration recipe before exposing writable files or commands."
  };
  const artifacts = [], commands = [], checks = [], evidence = [];
  for (const target of validation.targets) {
    const recipe = renderPlatformRecipe(target);
    artifacts.push(...recipe.artifacts.map((item) => ({ ...item, targetId: target.id })));
    commands.push(...recipe.commands.map((item) => ({ ...item, targetId: target.id })));
    checks.push(...recipe.checks.map((value) => ({ targetId: target.id, command: value, workingDirectory: target.path, status: "not-run" })));
    evidence.push(...optionEvidence(target));
  }
  const normalizedSelection = { version: 2, catalogVersion: PLATFORM_CATALOG_VERSION, targets: validation.targets };
  artifacts.unshift({ path: ".project-bootstrap/selection.yaml", content: JSON.stringify(normalizedSelection, null, 2) + "\n", template: "platform-selection-v2", operation: "create", approvalRequired: true, targetId: null });
  artifacts.push({ path: "docs/project-bootstrap/platform-validation.md", content: [
    "# Platform selection validation", "", `- Catalogue: ${PLATFORM_CATALOG_VERSION}`,
    `- Status: ${validation.status}`, "", ...validation.messages.map((item) => `- ${item.status}: ${item.code}${item.targetId ? ` (${item.targetId})` : ""} — ${item.message}`), ""
  ].join("\n"), template: "platform-validation-v2", operation: "create", approvalRequired: true, targetId: null });
  const unverifiedRecipe = evidence.some((item) => item.generation === "recipe-preview");
  const existing = new Set(Array.isArray(inventory.files) ? inventory.files : []);
  const flutterScaffolds = validation.targets.filter((target) => target.platformId === "flutter"
    && ![...existing].some((file) => file === (target.path === "." ? "pubspec.yaml" : `${target.path}/pubspec.yaml`)));
  if (flutterScaffolds.length) {
    if ((inventory.state === "existing" || existing.size > 0) && requirements.reinspectionAfterScaffold !== true) return {
      status: "migration-review", validation, selection: normalizedSelection, evidence,
      artifacts: artifacts.map((item) => ({ ...item, operation: "migration-review", reason: "The workspace already contains files; do not run flutter create without an explicit target layout and migration review." })),
      commands: [], pendingCommands: commands, checks,
      safeguards: ["Existing workspace files are preserved; no generator or write is authorized."]
    };
    const firstCommands = commands.filter((item) => flutterScaffolds.some((target) => item.targetId === target.id && item.command.startsWith("flutter create ")));
    if (unverifiedRecipe) return {
      status: "recipe-preview", validation, selection: normalizedSelection, evidence,
      artifacts: artifacts.map((item) => ({ ...item, operation: "recipe-preview", phase: "post-runtime-scaffold" })),
      commands: [], pendingCommands: commands, checks,
      safeguards: ["Flutter scaffold and overlay are preview-only until the release recipe passes platform build and test gates."]
    };
    return {
      status: "awaiting-scaffold", validation, selection: normalizedSelection, evidence,
      artifacts: artifacts.map((item) => ({ ...item, phase: "post-runtime-scaffold" })),
      commands: firstCommands, pendingCommands: commands.filter((item) => !firstCommands.includes(item)), checks,
      runtimeSetup: { artifactWritePhase: "post-runtime-scaffold", reinspectionRequired: true,
        message: "Approve and run only the Flutter scaffold command, then re-inspect generated files and request path-specific decisions for overlays." },
      safeguards: ["No files are written by this tool.", "The generator command needs separate approval; do not write overlay artifacts before reinspection."]
    };
  }
  for (const item of artifacts) {
    if (existing.has(item.path)) {
      item.operation = "conflict";
      item.reason = "Existing user-owned file; compare and request path-specific approval before any replacement.";
    }
  }
  const existingProject = (inventory.state === "existing" || existing.size > 0) && requirements.reinspectionAfterScaffold !== true;
  if (existingProject) {
    for (const item of artifacts) if (item.operation === "create") {
      item.operation = "migration-review";
      item.reason = "Existing project configuration is preserved. Review a target-specific diff and approve migration separately.";
    }
  }
  const windowsIos = validation.hostPlatform !== "macos" && validation.targets.some((target) => target.platformId === "ios");
  if (windowsIos) {
    for (const item of artifacts.filter((candidate) => validation.targets.some((target) => target.id === candidate.targetId && target.platformId === "ios"))) {
      if (item.operation === "create") item.operation = "deferred";
      item.reason = "Native iOS project generation and Xcode verification require macOS.";
    }
  }
  const blockingArtifacts = artifacts.some((item) => item.operation !== "create");
  if (unverifiedRecipe && !existingProject) {
    for (const item of artifacts) if (item.operation === "create") item.operation = "recipe-preview";
  }
  const scheduledCommands = existingProject || blockingArtifacts ? [] : commands;
  return {
    status: existingProject ? "migration-review" : unverifiedRecipe ? "recipe-preview" : blockingArtifacts ? "ready-with-deferred-files" : validation.status === "warning" ? "ready-with-warnings" : "ready",
    validation,
    selection: normalizedSelection,
    evidence, artifacts,
    commands: unverifiedRecipe ? [] : scheduledCommands,
    pendingCommands: unverifiedRecipe || !scheduledCommands.length ? commands : [],
    checks,
    safeguards: [
      "This tool performs no writes and runs no commands.",
      "Selection, file changes, dependency installation, SDK generators, and cloud actions have separate approval boundaries.",
      "Existing files are preserved; conflicts and migrations need path-specific decisions.",
      "Verification commands are proposals with not-run status, not claims of successful builds.",
      ...(unverifiedRecipe ? ["Preview recipes are not generation-ready. No file or command approval is requested until release CI covers this exact candidate and platform."] : [])
    ]
  };
}
