// Release-reviewed platform choices. The legacy Markdown catalogue remains supported.
export const PLATFORM_SELECTION_VERSION = 2;
export const PLATFORM_CATALOG_VERSION = "2026.10.3";

const observedAt = "2026-10-19";
const SOURCES = {
  web: ["survey-usage", "https://survey.stackoverflow.co/2026/technology/data/web-framework"],
  db: ["survey-usage", "https://survey.stackoverflow.co/2026/technology/data/databases"],
  android: ["official-guidance", "https://developer.android.com/topic/architecture/recommendations"],
  flutter: ["official-guidance", "https://docs.flutter.dev/app-architecture/guide"],
  apple: ["official-guidance", "https://developer.apple.com/documentation/SwiftUI/Managing-model-data-in-your-app"],
  expo: ["official-guidance", "https://docs.expo.dev/router/introduction/"],
  electron: ["official-generator", "https://www.electronforge.io/templates/vite"],
  tauri: ["official-generator", "https://v2.tauri.app/start/create-project/"]
};
const source = (key) => ({ type: SOURCES[key][0], url: SOURCES[key][1], observedAt });
const choices = (sourceKey, rows) => rows.map(([id, label, versionBaseline, reason]) => ({
  id, label, versionBaseline, reason, evidence: [source(sourceKey)], generation: "recipe-preview"
}));
const slot = (sourceKey, defaultId, rows, multiple = false) => ({
  required: !!defaultId, defaultId: defaultId || null, multiple,
  options: choices(sourceKey, rows)
});

const database = slot("db", null, [
  ["data.postgresql", "PostgreSQL", "catalog-2026.10", "Default shared relational database when a server is needed."],
  ["data.sqlite", "SQLite", "catalog-2026.10", "Embedded persistence without an extra service."],
  ["data.mysql", "MySQL", "catalog-2026.10", "Alternative for an existing MySQL environment."]
]);
const services = {
  auth: slot("web", null, [["security.oidc", "OIDC", "catalog-2026.10", "Provider-neutral opt-in authentication."]]),
  observability: slot("web", null, [["observability.opentelemetry", "OpenTelemetry", "catalog-2026.10", "Opt-in tracing after exporter and privacy review."]]),
  delivery: slot("web", null, [
    ["delivery.docker-compose", "Docker Compose", "catalog-2026.10", "Optional local service orchestration."],
    ["delivery.github-actions", "GitHub Actions", "catalog-2026.10", "Optional CI for a GitHub-hosted repository."]
  ], true)
};
for (const value of Object.values(services)) for (const candidate of value.options) candidate.generation = "conditional-review";

export const PLATFORM_CATALOG = {
  web: { label: "Web", slots: {
    framework: slot("web", "web.nextjs", [["web.nextjs", "Next.js + TypeScript", "Next.js 16", "Full-stack React default."], ["web.vite", "React + Vite + TypeScript", "Vite 8", "Client-only SPA with a separate API."]]),
    architecture: slot("web", "web.feature-modules", [["web.feature-modules", "Feature modules", "2026.10", "UI code grouped by product feature."]]),
    state: slot("web", "web.react-state", [["web.react-state", "React state/context", "React 19", "Built-in state first."], ["web.zustand", "Zustand", "Zustand 5", "Small shared store."], ["web.redux", "Redux Toolkit", "Redux Toolkit 2", "Explicit large-app transitions."]]),
    serverState: slot("web", null, [["web.tanstack-query", "TanStack Query", "TanStack Query 5", "Remote data caching and synchronization."]]),
    database, testing: slot("web", "web.vitest-playwright", [["web.vitest-playwright", "Vitest 5 + Playwright", "Vitest 5", "Unit and browser test baseline; this recipe uses Node.js 22.13+."]]),
    ...services
  } },
  api: { label: "API service", slots: {
    language: slot("web", "api.python", [
      ["api.python", "Python", "Python 3.12", "FastAPI and Python data ecosystem."],
      ["api.typescript", "TypeScript", "TypeScript 5", "NestJS and Node.js ecosystem."],
      ["api.java", "Java", "Java 17+", "Spring Boot ecosystem."],
      ["api.kotlin", "Kotlin", "Kotlin 2.4", "Ktor and Kotlin ecosystem."],
      ["api.go-language", "Go", "Go 1.27", "Standard-library HTTP service."],
      ["api.csharp", "C#", ".NET 10", "ASP.NET Core ecosystem."]
    ]),
    framework: slot("web", "api.fastapi", [
      ["api.fastapi", "Python + FastAPI", "FastAPI 0.115", "Low-boilerplate API default when no language is fixed."],
      ["api.nestjs", "TypeScript + NestJS", "NestJS 11", "Structured TypeScript service with built-in DI."],
      ["api.spring", "Java + Spring Boot", "Spring Boot 3.5.16", "Mature JVM service ecosystem on a supported release line."],
      ["api.ktor", "Kotlin + Ktor", "Ktor 3.6.0", "Kotlin-first lightweight service."],
      ["api.go", "Go HTTP", "Go 1.27", "Small standard-library HTTP service."],
      ["api.aspnet", "C# + ASP.NET Core", ".NET 10 LTS", "Integrated .NET service tooling on the active LTS release."]
    ]),
    architecture: slot("web", "api.modular", [["api.modular", "Modular monolith", "2026.10", "One deployable with explicit module boundaries."], ["api.hexagonal", "Hexagonal", "2026.10", "Separate domain ports and infrastructure adapters."]]),
    database, testing: slot("web", "api.standard-tests", [["api.standard-tests", "Framework-standard tests", "2026.10", "Test runner matching the selected runtime."]]),
    ...services
  } },
  android: { label: "Native Android", slots: {
    architecture: slot("android", "android.mvvm", [["android.mvvm", "MVVM + Compose", "2026.10", "ViewModel and unidirectional UI data flow."], ["android.mvi", "MVI + Compose", "2026.10", "Explicit intents and immutable UI state."]]),
    state: slot("android", "android.stateflow", [["android.stateflow", "ViewModel + StateFlow", "2026.10", "Jetpack state baseline."], ["android.mavericks", "Mavericks", "2026.10", "MVI-style state library."], ["android.orbit", "Orbit MVI", "2026.10", "Container-based MVI state."]]),
    dependencyInjection: slot("android", "android.hilt", [["android.hilt", "Hilt", "2026.10", "Jetpack-aligned DI."], ["android.koin", "Koin", "2026.10", "Kotlin DSL DI alternative."]]),
    database: slot("android", null, [["android.room", "Room", "2026.10", "Jetpack local persistence."]]),
    testing: slot("android", "android.junit", [["android.junit", "JUnit + Compose tests", "2026.10", "Unit and UI tests."]])
  } },
  expo: { label: "Expo", slots: {
    architecture: slot("expo", "expo.router", [["expo.router", "Expo Router", "Expo SDK 58", "Default file-based navigation."]]),
    state: slot("expo", "expo.react-state", [["expo.react-state", "React state/context", "React 19", "Built-in UI state."], ["expo.zustand", "Zustand", "Zustand 5", "Small shared store."], ["expo.redux", "Redux Toolkit", "Redux Toolkit 2", "Explicit shared transitions."]]),
    database: slot("expo", null, [["expo.sqlite", "Expo SQLite", "Expo SDK 58", "Offline local persistence."]]),
    testing: slot("expo", "expo.jest", [["expo.jest", "Jest + React Native Testing Library", "2026.10", "Component testing."]])
  } },
  flutter: { label: "Flutter", slots: {
    architecture: slot("flutter", "flutter.mvvm", [["flutter.mvvm", "MVVM", "2026.10", "Flutter view/view-model/repository split."], ["flutter.bloc-pattern", "BLoC", "2026.10", "Event-to-state alternative."]]),
    state: slot("flutter", "flutter.change-notifier", [["flutter.change-notifier", "ChangeNotifier", "2026.10", "SDK baseline."], ["flutter.riverpod", "Riverpod", "Riverpod 2", "Provider-based reactive state."], ["flutter.bloc", "flutter_bloc", "flutter_bloc 8", "BLoC state library."]]),
    navigation: slot("flutter", "flutter.go-router", [["flutter.go-router", "go_router", "go_router 14", "Declarative navigation."]]),
    database: slot("flutter", null, [["flutter.sqflite", "sqflite", "sqflite 2", "Local SQLite persistence."]]),
    testing: slot("flutter", "flutter.flutter-test", [["flutter.flutter-test", "flutter_test", "2026.10", "SDK unit and widget tests."]])
  } },
  ios: { label: "Native iOS", slots: {
    architecture: slot("apple", "ios.mvvm", [["ios.mvvm", "SwiftUI MVVM", "iOS 17+", "View models with Observation."], ["ios.tca", "The Composable Architecture", "iOS 17+", "Reducer-driven effects and state."]]),
    state: slot("apple", "ios.observation", [["ios.observation", "Observation", "iOS 17+", "Native @Observable state."]]),
    database: slot("apple", null, [["ios.swiftdata", "SwiftData", "iOS 17+", "Native persistent models."]]),
    testing: slot("apple", "ios.swift-testing", [["ios.swift-testing", "Swift Testing", "Xcode 16+", "Native Swift test baseline."]])
  } },
  desktop: { label: "Desktop", slots: {
    framework: slot("electron", "desktop.electron", [["desktop.electron", "Electron Forge + React", "Forge 7", "Vite-based Electron scaffold."], ["desktop.tauri", "Tauri 2 + React", "Tauri 2", "Rust-backed desktop alternative."]]),
    architecture: slot("electron", "desktop.feature-modules", [["desktop.feature-modules", "Feature modules + secure IPC", "2026.10", "Separate UI from privileged commands."]]),
    state: slot("web", "desktop.react-state", [["desktop.react-state", "React state/context", "React 19", "Built-in UI state."], ["desktop.zustand", "Zustand", "Zustand 5", "Small shared store."], ["desktop.redux", "Redux Toolkit", "Redux Toolkit 2", "Explicit shared transitions."]]),
    database: slot("db", null, [["desktop.sqlite", "SQLite", "2026.10", "Local persistence behind native boundary."]]),
    testing: slot("web", "desktop.vitest", [["desktop.vitest", "Vitest", "Vitest 5", "Unit tests on Node.js 22.13+."]])
  } },
  data: { label: "Data and AI", slots: {
    architecture: slot("web", "data.pipeline", [["data.pipeline", "Python pipeline", "Python 3.12", "Explicit ingest/transform/output stages."], ["data.api", "FastAPI service", "FastAPI 0.115", "Serve a data workload through an API."]]),
    dataframe: slot("web", "data.pandas", [["data.pandas", "pandas", "pandas 2", "Broad Python data-tool compatibility."], ["data.polars", "Polars", "Polars 1", "Columnar dataframe alternative."]]),
    testing: slot("web", "data.pytest", [["data.pytest", "pytest", "pytest 8", "Python test baseline."]])
  } }
};

const OFFICIAL_REFERENCES = {
  "web.nextjs": "https://nextjs.org/docs", "web.vite": "https://vite.dev/guide/",
  "web.zustand": "https://zustand.docs.pmnd.rs/getting-started/introduction",
  "expo.zustand": "https://zustand.docs.pmnd.rs/getting-started/introduction",
  "desktop.zustand": "https://zustand.docs.pmnd.rs/getting-started/introduction",
  "web.redux": "https://redux-toolkit.js.org/introduction/getting-started",
  "expo.redux": "https://redux-toolkit.js.org/introduction/getting-started",
  "desktop.redux": "https://redux-toolkit.js.org/introduction/getting-started",
  "web.tanstack-query": "https://tanstack.com/query/latest/docs/framework/react/overview",
  "api.fastapi": "https://fastapi.tiangolo.com/", "api.nestjs": "https://docs.nestjs.com/",
  "api.python": "https://www.python.org/doc/", "api.typescript": "https://www.typescriptlang.org/docs/",
  "api.java": "https://dev.java/learn/", "api.kotlin": "https://kotlinlang.org/docs/home.html",
  "api.go-language": "https://go.dev/doc/", "api.csharp": "https://learn.microsoft.com/en-us/dotnet/csharp/",
  "api.spring": "https://spring.io/projects/spring-boot", "api.ktor": "https://ktor.io/docs/welcome.html",
  "api.go": "https://go.dev/doc/", "api.aspnet": "https://learn.microsoft.com/en-us/aspnet/core/",
  "android.hilt": "https://developer.android.com/training/dependency-injection/hilt-android",
  "android.koin": "https://insert-koin.io/docs/quickstart/android/",
  "android.room": "https://developer.android.com/training/data-storage/room",
  "android.mavericks": "https://airbnb.io/mavericks/", "android.orbit": "https://orbit-mvi.org/",
  "flutter.riverpod": "https://riverpod.dev/", "flutter.bloc": "https://bloclibrary.dev/",
  "ios.tca": "https://pointfreeco.github.io/swift-composable-architecture/main/documentation/composablearchitecture/",
  "ios.swiftdata": "https://developer.apple.com/documentation/swiftdata",
  "data.pandas": "https://pandas.pydata.org/docs/", "data.polars": "https://docs.pola.rs/"
};
const RELEASE_REFERENCES = {
  "web.nextjs": "https://nextjs.org/blog",
  "web.vite": "https://vite.dev/blog/announcing-vite8",
  "api.spring": "https://docs.spring.io/spring-boot/3.5/system-requirements.html",
  "api.ktor": "https://ktor.io/docs/releases.html",
  "api.go": "https://go.dev/doc/devel/release",
  "api.aspnet": "https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core",
  "expo.router": "https://docs.expo.dev/versions/v58.0.0/"
};
const NON_SURVEY_CHOICES = {
  "web.feature-modules": "https://react.dev/learn/thinking-in-react",
  "web.react-state": "https://react.dev/learn/managing-state",
  "expo.react-state": "https://react.dev/learn/managing-state",
  "api.modular": "https://martinfowler.com/bliki/MonolithFirst.html",
  "api.hexagonal": "https://alistair.cockburn.us/hexagonal-architecture/",
  "api.standard-tests": "https://martinfowler.com/bliki/TestPyramid.html",
  "desktop.feature-modules": "https://www.electronjs.org/docs/latest/tutorial/security",
  "desktop.react-state": "https://react.dev/learn/managing-state",
  "data.pipeline": "https://packaging.python.org/en/latest/tutorials/packaging-projects/",
  "data.pandas": "https://pandas.pydata.org/docs/",
  "data.polars": "https://docs.pola.rs/",
  "data.pytest": "https://docs.pytest.org/"
};
const LIBRARY_ONLY_EVIDENCE = new Set([
  "api.python", "api.typescript", "api.java", "api.kotlin", "api.go-language", "api.csharp",
  "web.zustand", "expo.zustand", "desktop.zustand", "web.redux", "expo.redux", "desktop.redux", "web.tanstack-query",
  "android.hilt", "android.koin", "android.room", "android.mavericks", "android.orbit",
  "flutter.riverpod", "flutter.bloc", "ios.tca", "ios.swiftdata"
]);
const FOCUSED_REFERENCES = {
  "web.vitest-playwright": ["https://vitest.dev/guide/", "https://playwright.dev/docs/intro"],
  "expo.jest": ["https://docs.expo.dev/develop/unit-testing/"],
  "android.junit": ["https://developer.android.com/training/testing/local-tests"],
  "ios.swift-testing": ["https://developer.apple.com/documentation/testing/"],
  "desktop.vitest": ["https://vitest.dev/guide/"],
  "security.oidc": ["https://openid.net/specs/openid-connect-core-1_0.html"],
  "observability.opentelemetry": ["https://opentelemetry.io/docs/"],
  "delivery.docker-compose": ["https://docs.docker.com/compose/"],
  "delivery.github-actions": ["https://docs.github.com/en/actions"]
};
for (const platform of Object.values(PLATFORM_CATALOG)) {
  for (const value of Object.values(platform.slots)) {
    for (const candidate of value.options) {
      if (NON_SURVEY_CHOICES[candidate.id]) candidate.evidence = [{ type: "official-or-originator-guidance", url: NON_SURVEY_CHOICES[candidate.id], observedAt }];
      if (LIBRARY_ONLY_EVIDENCE.has(candidate.id)) candidate.evidence = [];
      if (candidate.id === "desktop.tauri") candidate.evidence = [source("tauri")];
      if (FOCUSED_REFERENCES[candidate.id]) candidate.evidence = FOCUSED_REFERENCES[candidate.id].map((url) => ({ type: "official-documentation", url, observedAt }));
      if (OFFICIAL_REFERENCES[candidate.id]) candidate.evidence.push({ type: "official-documentation", url: OFFICIAL_REFERENCES[candidate.id], observedAt });
      if (RELEASE_REFERENCES[candidate.id]) candidate.evidence.push({ type: "official-release", url: RELEASE_REFERENCES[candidate.id], observedAt });
    }
  }
}

export function recommendedPlatformDefault(platformId, slotKey, requirements = {}) {
  if (platformId === "web" && slotKey === "framework" && requirements.productType === "spa") return "web.vite";
  if (platformId === "api" && slotKey === "language") {
    const byLanguage = { python: "api.python", typescript: "api.typescript", java: "api.java", kotlin: "api.kotlin", go: "api.go-language", csharp: "api.csharp", "c#": "api.csharp" };
    return byLanguage[String(requirements.preferredLanguage || "").toLowerCase()] || "api.python";
  }
  if (platformId === "api" && slotKey === "framework") {
    const byLanguage = { python: "api.fastapi", typescript: "api.nestjs", java: "api.spring", kotlin: "api.ktor", go: "api.go", csharp: "api.aspnet", "c#": "api.aspnet" };
    if (byLanguage[String(requirements.preferredLanguage || "").toLowerCase()]) return byLanguage[String(requirements.preferredLanguage).toLowerCase()];
  }
  if (slotKey === "database" && requirements.persistentData === true) {
    if (platformId === "web" && requirements.productType === "spa") return null;
    if (["web", "api"].includes(platformId)) return "data.postgresql";
    return { android: "android.room", expo: "expo.sqlite", flutter: "flutter.sqflite", ios: "ios.swiftdata", desktop: "desktop.sqlite" }[platformId] || null;
  }
  return PLATFORM_CATALOG[platformId]?.slots[slotKey]?.defaultId || null;
}

export function listPlatformChoices({ platformId, locale = "en", requirements = {} } = {}) {
  const selected = platformId ? [[platformId, PLATFORM_CATALOG[platformId]]] : Object.entries(PLATFORM_CATALOG);
  if (selected.some(([, platform]) => !platform)) throw new Error(`Unknown platform: ${platformId}`);
  return {
    schemaVersion: PLATFORM_SELECTION_VERSION, catalogVersion: PLATFORM_CATALOG_VERSION, locale,
    platforms: selected.map(([id, platform]) => ({ id, label: platform.label, slots: Object.entries(platform.slots).map(([key, value]) => ({ key, ...value, defaultId: recommendedPlatformDefault(id, key, requirements) })) })),
    note: "Defaults are suggestions. Set useDefaults: true or specify every required slot. Recipe-preview options need platform build verification before a release can label them generation-ready. External services need a separate integration review."
  };
}
