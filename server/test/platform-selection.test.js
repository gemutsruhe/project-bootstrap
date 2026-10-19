import assert from "node:assert/strict";
import test from "node:test";
import { createPlan, invokeTool, validateSelection } from "../src/core.js";
import { listPlatformChoices, PLATFORM_CATALOG } from "../src/platform-catalog.js";
import { createPlatformPlan } from "../src/platform-plan.js";
import { renderPlatformRecipe } from "../src/platform-recipes.js";

const target = (platformId, choices = {}, extras = {}) => ({ id: platformId, platformId, path: platformId, choices, useDefaults: true, ...extras });
const selection = (...targets) => ({ version: 2, targets });

test("all platform defaults have release evidence and an actual recipe with verification", () => {
  const listed = listPlatformChoices();
  assert.equal(listed.platforms.length, 8);
  for (const [platformId, platform] of Object.entries(PLATFORM_CATALOG)) {
    const selected = validateSelection([], { selection: selection(target(platformId)), hostPlatform: "macos" });
    assert.notEqual(selected.status, "block", `${platformId}: ${JSON.stringify(selected.messages)}`);
    const recipe = renderPlatformRecipe(selected.targets[0]);
    assert.ok(recipe.artifacts.some((item) => item.path.endsWith("platform-decisions.md")));
    assert.ok(recipe.artifacts.some((item) => !item.path.endsWith(".md")), `${platformId} must generate runtime files`);
    assert.ok(recipe.checks.length > 0, `${platformId} needs verification commands`);
    for (const slot of Object.values(platform.slots)) {
      for (const option of slot.options) {
        assert.ok(option.evidence.every((source) => /^https:\/\//.test(source.url) && source.observedAt));
        assert.ok(option.versionBaseline);
      }
    }
  }
});

test("every exposed alternative is accepted and changes the normalized decision", () => {
  for (const [platformId, platform] of Object.entries(PLATFORM_CATALOG)) {
    for (const [slotName, slot] of Object.entries(platform.slots)) {
      for (const option of slot.options) {
        const choice = slot.multiple ? [option.id] : option.id;
        const overrides = { [slotName]: choice };
        if (option.id === "android.orbit" || option.id === "android.mavericks") overrides.architecture = "android.mvi";
        if (option.id === "flutter.bloc") overrides.architecture = "flutter.bloc-pattern";
        if (option.id === "flutter.bloc-pattern") overrides.state = "flutter.bloc";
        if (option.id === "delivery.github-actions") continue; // Host setting is tested separately.
        if (platformId === "web" && option.id === "data.postgresql") overrides.framework = "web.nextjs";
        if (platformId === "web" && option.id === "data.sqlite") overrides.framework = "web.nextjs";
        if (platformId === "web" && option.id === "data.mysql") overrides.framework = "web.nextjs";
        const selected = validateSelection([], { selection: selection(target(platformId, overrides)), hostPlatform: "macos" });
        assert.notEqual(selected.status, "block", `${platformId}.${slotName}.${option.id}: ${JSON.stringify(selected.messages)}`);
        assert.ok(Object.values(selected.targets[0].choices).flat().includes(option.id));
        assert.ok(renderPlatformRecipe(selected.targets[0]).artifacts.length > 1);
      }
    }
  }
});

test("preview alternatives change at least one runtime artifact", () => {
  const runtime = (recipe) => recipe.artifacts.filter((item) => !item.path.endsWith(".md")).map((item) => `${item.path}\n${item.content}`).join("\n");
  for (const [platformId, platform] of Object.entries(PLATFORM_CATALOG)) {
    const baseline = validateSelection([], { selection: selection(target(platformId)), hostPlatform: "macos" }).targets[0];
    for (const [slotName, slot] of Object.entries(platform.slots)) for (const option of slot.options) {
      if (option.generation !== "recipe-preview" || option.id === slot.defaultId) continue;
      const overrides = { [slotName]: slot.multiple ? [option.id] : option.id };
      if (option.id === "android.orbit" || option.id === "android.mavericks") overrides.architecture = "android.mvi";
      if (option.id === "flutter.bloc") overrides.architecture = "flutter.bloc-pattern";
      if (option.id === "flutter.bloc-pattern") overrides.state = "flutter.bloc";
      const selected = validateSelection([], { selection: selection(target(platformId, overrides)), hostPlatform: "macos" });
      assert.notEqual(selected.status, "block");
      assert.notEqual(runtime(renderPlatformRecipe(selected.targets[0])), runtime(renderPlatformRecipe(baseline)), `${option.id} only changed documentation`);
    }
  }
});

test("generated manifests parse and cross-framework database recipes include a driver", () => {
  for (const [platformId] of Object.entries(PLATFORM_CATALOG)) {
    const checked = validateSelection([], { selection: selection(target(platformId)), hostPlatform: "macos" });
    const recipe = renderPlatformRecipe(checked.targets[0]);
    const paths = recipe.artifacts.map((item) => item.path);
    assert.equal(new Set(paths).size, paths.length, `${platformId} has duplicate files`);
    for (const file of recipe.artifacts.filter((item) => item.path.endsWith(".json"))) assert.doesNotThrow(() => JSON.parse(file.content), file.path);
  }
  for (const framework of PLATFORM_CATALOG.api.slots.framework.options.map((item) => item.id)) {
    for (const database of PLATFORM_CATALOG.api.slots.database.options.map((item) => item.id)) {
      const checked = validateSelection([], { selection: selection(target("api", { framework, database })), hostPlatform: "linux" });
      if (framework === "api.spring" && database === "data.sqlite") {
        assert.equal(checked.status, "block");
        continue;
      }
      assert.notEqual(checked.status, "block", `${framework} + ${database}`);
      const recipe = renderPlatformRecipe(checked.targets[0]);
      assert.ok(recipe.artifacts.some((item) => /database|Database|schema\.prisma|AppDbContext|application\.properties/.test(item.path)), `${framework} + ${database}`);
    }
  }
});

test("incompatible combinations, unsafe paths, and overlapping targets block generation", () => {
  const bad = validateSelection([], { selection: selection(
    target("android", { state: "android.orbit" }, { path: "apps/mobile" }),
    target("api", {}, { path: "apps/mobile/api" })
  ), hostPlatform: "linux" });
  assert.equal(bad.status, "block");
  assert.ok(bad.messages.some((item) => item.code === "orbit-requires-mvi"));
  assert.ok(bad.messages.some((item) => item.code === "overlapping-target-paths"));
  const traversal = validateSelection([], { selection: selection(target("web", {}, { path: "../escape" })) });
  assert.ok(traversal.messages.some((item) => item.code === "unsafe-target-path"));
  const wrongPlatform = validateSelection([], { selection: selection(target("ios", { state: "web.zustand" })) });
  assert.ok(wrongPlatform.messages.some((item) => item.code === "incompatible-option"));
  const springSqlite = validateSelection([], { selection: selection(target("api", { framework: "api.spring", database: "data.sqlite" })) });
  assert.ok(springSqlite.messages.some((item) => item.code === "spring-sqlite-dialect-unavailable"));
  const oldExpo = validateSelection([], { selection: selection(target("expo")), requirements: { platformVersions: { expo: { expoSdk: 57, nodeMajor: 20 } } } });
  assert.ok(oldExpo.messages.some((item) => item.code === "expo-sdk-mismatch"));
  assert.ok(oldExpo.messages.some((item) => item.code === "expo-node-too-old"));
  const oldVite = validateSelection([], { selection: selection(target("web", { framework: "web.vite" })), requirements: { platformVersions: { web: { nodeMajor: 20, nodeMinor: 18 } } } });
  assert.ok(oldVite.messages.some((item) => item.code === "node-test-toolchain-unsupported"));
  const oldDotnet = validateSelection([], { selection: selection(target("api", { framework: "api.aspnet" })), requirements: { platformVersions: { api: { dotnetMajor: 9 } } } });
  assert.ok(oldDotnet.messages.some((item) => item.code === "dotnet-sdk-mismatch"));
  const mismatchedApi = validateSelection([], { selection: selection(target("api", { language: "api.python", framework: "api.ktor" })) });
  assert.ok(mismatchedApi.messages.some((item) => item.code === "api-language-framework-conflict"));
});

test("reviewed release baselines match the emitted runtime versions", () => {
  const examples = [
    ["web", { framework: "web.nextjs" }, "package.json", '"next": "^16.0.0"'],
    ["web", { framework: "web.vite" }, "package.json", '"vite": "^8.0.0"'],
    ["api", { framework: "api.nestjs" }, "package.json", '"@nestjs/core": "^11.0.0"'],
    ["api", { framework: "api.spring" }, "build.gradle", "org.springframework.boot' version '3.5.16"],
    ["api", { framework: "api.ktor" }, "build.gradle.kts", "ktor-server-core-jvm:3.6.0"],
    ["api", { framework: "api.go" }, "go.mod", "go 1.27"],
    ["api", { framework: "api.aspnet" }, "BootstrapApi.csproj", "net10.0"]
  ];
  for (const [platform, choices, filename, version] of examples) {
    const checked = validateSelection([], { selection: selection(target(platform, choices)) });
    const file = renderPlatformRecipe(checked.targets[0]).artifacts.find((item) => item.path.endsWith(filename));
    assert.ok(file?.content.includes(version), `${platform}.${choices.framework} did not emit ${version}`);
  }
});

test("smoke-discovered runtime prerequisites stay in generated recipes", () => {
  const planned = (platform, overrides = {}) => renderPlatformRecipe(validateSelection([], { selection: selection(target(platform, overrides)) }).targets[0]);
  const file = (recipe, suffix) => recipe.artifacts.find((item) => item.path.endsWith(suffix))?.content;
  const vite = planned("web", { framework: "web.vite" });
  assert.match(file(vite, "src/providers.tsx"), /<>{children}<\/>/);
  assert.match(file(vite, "package.json"), /"vitest": "\^5\.0\.0"/);
  const nextDb = planned("web", { database: "data.postgresql" });
  assert.ok(nextDb.commands.some((item) => item.command === "npx prisma generate"));
  assert.ok(file(nextDb, "src/data/db.ts").includes("PrismaClient"));
  assert.ok(file(nextDb, "package.json").includes('"@types/node"'));
  const expo = planned("expo");
  const expoPackage = JSON.parse(file(expo, "package.json"));
  assert.equal(expoPackage.dependencies["react-dom"], "19.3.0");
  assert.equal(expoPackage.dependencies["react-native-screens"], "~4.30.0");
  assert.equal(expoPackage.devDependencies.typescript, "~6.0.3");
  assert.equal(expoPackage.devDependencies.jest, "^30.0.0");
  assert.deepEqual(expo.commands.map((item) => item.command), ["npm install"]);
  assert.ok(file(expo, "tests/baseline.test.ts"));
  const flutter = planned("flutter");
  assert.ok(file(flutter, "pubspec.yaml").includes("flutter_lints: ^6.0.0"));
  const desktop = planned("desktop");
  const desktopPackage = JSON.parse(file(desktop, "package.json"));
  assert.equal(desktopPackage.name, "bootstrap-desktop");
  assert.equal(desktopPackage.version, "0.1.0");
  const tauri = planned("desktop", { framework: "desktop.tauri" });
  const tauriPackage = JSON.parse(file(tauri, "package.json"));
  assert.equal(tauriPackage.scripts.predev, "tauri icon app-icon.svg");
  assert.equal(tauriPackage.scripts.prebuild, "tauri icon app-icon.svg");
  assert.match(file(tauri, "app-icon.svg"), /<svg/);
});

test("defaults require explicit acceptance and optional external services remain off", () => {
  const missing = validateSelection([], { selection: selection(target("web", {}, { useDefaults: false })) });
  assert.equal(missing.status, "block");
  assert.ok(missing.messages.some((item) => item.code === "missing-required-slot"));
  const accepted = validateSelection([], { selection: selection(target("web")) });
  assert.equal(accepted.targets[0].choices.auth, undefined);
  assert.equal(accepted.targets[0].choices.delivery, undefined);
  assert.equal(accepted.targets[0].choices.framework, "web.nextjs");
  const spaDefaults = listPlatformChoices({ platformId: "web", requirements: { productType: "spa" } });
  assert.equal(spaDefaults.platforms[0].slots.find((slot) => slot.key === "framework").defaultId, "web.vite");
  const spa = validateSelection([], { selection: selection(target("web")), requirements: { productType: "spa" } });
  assert.equal(spa.targets[0].choices.framework, "web.vite");
  const kotlinApi = validateSelection([], { selection: selection(target("api")), requirements: { preferredLanguage: "kotlin", persistentData: true } });
  assert.equal(kotlinApi.targets[0].choices.language, "api.kotlin");
  assert.equal(kotlinApi.targets[0].choices.framework, "api.ktor");
  assert.equal(kotlinApi.targets[0].choices.database, "data.postgresql");
});

test("existing files, Windows iOS, and custom research are never presented as approved generation", () => {
  const flutter = createPlatformPlan(selection(target("flutter")), { hostPlatform: "linux" });
  assert.equal(flutter.status, "recipe-preview");
  assert.ok(flutter.artifacts.every((item) => item.phase === "post-runtime-scaffold"));
  assert.equal(flutter.commands.length, 0);
  assert.ok(flutter.pendingCommands.some((item) => item.command.startsWith("flutter create ")));
  const occupiedFlutter = createPlatformPlan(selection(target("flutter")), { inventory: { state: "existing", files: ["README.md"] }, hostPlatform: "linux" });
  assert.equal(occupiedFlutter.status, "migration-review");
  assert.equal(occupiedFlutter.commands.length, 0);
  const ios = createPlan([], { selection: selection(target("ios")), hostPlatform: "windows" });
  assert.equal(ios.status, "recipe-preview");
  assert.ok(ios.artifacts.filter((item) => item.targetId === "ios").every((item) => item.operation === "deferred"));
  assert.equal(ios.commands.length, 0);
  const existing = createPlatformPlan(selection(target("web")), { inventory: { state: "existing", files: ["web/package.json"] }, hostPlatform: "linux" });
  assert.equal(existing.status, "migration-review");
  assert.equal(existing.commands.length, 0);
  assert.ok(existing.artifacts.some((item) => item.operation === "conflict"));
  const custom = createPlatformPlan(selection(target("api", {}, { customChoices: [{ slot: "framework", name: "My API", purpose: "Internal platform" }] })), { hostPlatform: "linux" });
  assert.equal(custom.status, "needs-custom-research");
  assert.equal(custom.artifacts.length, 0);
  const conditional = createPlatformPlan(selection(target("web", { auth: "security.oidc" })), { hostPlatform: "linux" });
  assert.equal(conditional.status, "needs-integration-review");
  assert.equal(conditional.commands.length, 0);
  const fresh = createPlatformPlan(selection(target("web")), { hostPlatform: "linux" });
  assert.equal(fresh.status, "recipe-preview");
  assert.equal(fresh.commands.length, 0);
  assert.ok(fresh.artifacts.every((item) => item.operation !== "create"));
});

test("public MCP tools expose v2 while legacy selection remains available", async () => {
  const listed = await invokeTool("list_platform_choices", { platformId: "flutter" });
  assert.equal(listed.platforms.length, 1);
  const checked = await invokeTool("validate_selection", { selection: selection(target("flutter")) });
  assert.equal(checked.targets[0].choices.state, "flutter.change-notifier");
  const planned = await invokeTool("create_plan", { selection: selection(target("data")) });
  assert.ok(planned.artifacts.some((item) => item.path === "data/pyproject.toml"));
  const legacy = await invokeTool("validate_selection", { selectedIds: ["language.python", "service.fastapi"] });
  assert.equal(legacy.status, "pass");
});
