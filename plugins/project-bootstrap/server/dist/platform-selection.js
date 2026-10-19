import path from "node:path";
import { PLATFORM_CATALOG, PLATFORM_CATALOG_VERSION, PLATFORM_SELECTION_VERSION, recommendedPlatformDefault } from "./platform-catalog.js";

const RESERVED = new Set([".git", "node_modules", ".project-bootstrap"]);
const WINDOWS_DEVICES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const hostName = () => process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
const API_LANGUAGE_BY_FRAMEWORK = { "api.fastapi": "api.python", "api.nestjs": "api.typescript", "api.spring": "api.java", "api.ktor": "api.kotlin", "api.go": "api.go-language", "api.aspnet": "api.csharp" };
const message = (status, code, targetId, detail, alternatives = []) => ({ status, code, targetId, message: detail, alternatives });

function safeTargetPath(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) return false;
  if (value === ".") return true;
  const parts = value.split("/");
  return parts.every((part) => part && part !== "." && part !== ".." && !part.endsWith(".") && !RESERVED.has(part.toLowerCase()) && !WINDOWS_DEVICES.test(part) && /^[A-Za-z0-9._-]+$/.test(part));
}

function normalizeCustom(value, targetId, messages) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12) {
    messages.push(message("block", "invalid-custom-choices", targetId, "customChoices must contain at most 12 entries."));
    return [];
  }
  return value.flatMap((item) => {
    const valid = item && typeof item === "object" && !Array.isArray(item)
      && ["language", "framework", "architecture", "state", "serverState", "database", "dataframe", "navigation", "dependencyInjection", "testing", "auth", "observability", "delivery"].includes(item.slot)
      && [item.name, item.purpose].every((field) => typeof field === "string" && field.trim() && field.length <= 300);
    if (!valid) {
      messages.push(message("block", "invalid-custom-choice", targetId, "A custom choice needs a valid slot, name, and purpose."));
      return [];
    }
    messages.push(message("warning", "custom-research-required", targetId, `${item.name} needs permission-based official-source research and a separately approved integration plan before generation.`));
    return [{ slot: item.slot, name: item.name.trim(), purpose: item.purpose.trim(), ...(item.replacesId ? { replacesId: item.replacesId } : {}) }];
  });
}

function validateTarget(raw, index, messages, requirements) {
  const id = typeof raw?.id === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(raw.id) ? raw.id : `target-${index + 1}`;
  if (id !== raw?.id) messages.push(message("block", "invalid-target-id", id, "Target id must be a lowercase slug starting with a letter."));
  const platform = PLATFORM_CATALOG[raw?.platformId];
  if (!platform) messages.push(message("block", "unknown-platform", id, `Unknown platform: ${raw?.platformId ?? "(missing)"}.`, Object.keys(PLATFORM_CATALOG)));
  const targetPath = raw?.path;
  if (!safeTargetPath(targetPath)) messages.push(message("block", "unsafe-target-path", id, "Target path must be a workspace-relative POSIX path without traversal or reserved directories."));
  const rawChoices = raw?.choices;
  if (!rawChoices || typeof rawChoices !== "object" || Array.isArray(rawChoices)) {
    messages.push(message("block", "invalid-target-choices", id, "choices must be an object keyed by platform slot."));
  }
  const choices = {};
  if (platform) {
    for (const [key, value] of Object.entries(rawChoices || {})) {
      const definition = platform.slots[key];
      if (!definition) {
        messages.push(message("block", "unknown-slot", id, `Unknown ${raw.platformId} slot: ${key}.`, Object.keys(platform.slots)));
        continue;
      }
      const values = definition.multiple ? value : [value];
      if (!Array.isArray(values) || values.length === 0 || values.some((item) => typeof item !== "string") || (!definition.multiple && Array.isArray(value))) {
        messages.push(message("block", "invalid-slot-value", id, `Slot ${key} needs ${definition.multiple ? "a nonempty list" : "one option ID"}.`));
        continue;
      }
      if (new Set(values).size !== values.length) messages.push(message("block", "duplicate-option", id, `Slot ${key} contains duplicate IDs.`));
      for (const item of values) {
        if (!definition.options.some((candidate) => candidate.id === item)) {
          messages.push(message("block", "incompatible-option", id, `${item} is not supported in ${raw.platformId}.${key}.`, definition.options.map((candidate) => candidate.id)));
        }
      }
      choices[key] = definition.multiple ? values : value;
    }
    for (const [key, definition] of Object.entries(platform.slots)) {
      const preferredLanguage = raw.platformId === "api" && choices.language ? choices.language === "api.go-language" ? "go" : choices.language.slice(4) : requirements.preferredLanguage;
      const recommended = raw.platformId === "api" && key === "language" && choices.framework
        ? API_LANGUAGE_BY_FRAMEWORK[choices.framework]
        : recommendedPlatformDefault(raw.platformId, key, { ...requirements, preferredLanguage });
      if (choices[key] === undefined && raw?.useDefaults === true && recommended) choices[key] = recommended;
      if (choices[key] === undefined && definition.required) {
        messages.push(message("block", "missing-required-slot", id, `Choose ${raw.platformId}.${key} or explicitly accept its default.`, [recommended]));
      }
    }
  }
  const customChoices = normalizeCustom(raw?.customChoices, id, messages);
  return { id, platformId: raw?.platformId, path: targetPath, choices, customChoices };
}

export function validatePlatformSelection(selection, { inventory = {}, hostPlatform = hostName(), requirements = {} } = {}) {
  const messages = [];
  if (!selection || typeof selection !== "object" || selection.version !== PLATFORM_SELECTION_VERSION || !Array.isArray(selection.targets) || selection.targets.length === 0 || selection.targets.length > 12) {
    return { status: "block", schemaVersion: PLATFORM_SELECTION_VERSION, catalogVersion: PLATFORM_CATALOG_VERSION,
      targets: [], messages: [message("block", "invalid-selection-v2", null, "selection.version must be 2 and targets must contain 1–12 targets.")] };
  }
  const targets = selection.targets.map((target, index) => validateTarget(target, index, messages, requirements));
  const seenIds = new Set();
  for (const target of targets) {
    if (seenIds.has(target.id)) messages.push(message("block", "duplicate-target-id", target.id, "Target IDs must be unique."));
    seenIds.add(target.id);
  }
  for (let index = 0; index < targets.length; index++) {
    for (const later of targets.slice(index + 1)) {
      const left = hostPlatform === "windows" ? targets[index].path?.toLowerCase() : targets[index].path;
      const right = hostPlatform === "windows" ? later.path?.toLowerCase() : later.path;
      if (safeTargetPath(left) && safeTargetPath(right) && (left === right || left === "." || right === "." || left.startsWith(`${right}/`) || right.startsWith(`${left}/`))) {
        messages.push(message("block", "overlapping-target-paths", targets[index].id, `Target paths ${left} and ${right} overlap.`));
      }
    }
  }
  for (const target of targets) {
    const { platformId, choices: c, id } = target;
    if (platformId === "api" && c.framework && c.language && API_LANGUAGE_BY_FRAMEWORK[c.framework] !== c.language) {
      messages.push(message("block", "api-language-framework-conflict", id, `${c.framework} requires ${API_LANGUAGE_BY_FRAMEWORK[c.framework]}; the selected language is ${c.language}.`, [API_LANGUAGE_BY_FRAMEWORK[c.framework]]));
    }
    if (c.state === "android.orbit" && c.architecture !== "android.mvi") messages.push(message("block", "orbit-requires-mvi", id, "Orbit MVI requires the Android MVI architecture.", ["android.mvi"]));
    if (c.state === "android.mavericks" && c.architecture !== "android.mvi") messages.push(message("block", "mavericks-requires-mvi", id, "The Mavericks recipe requires the Android MVI architecture.", ["android.mvi"]));
    if (c.state === "flutter.bloc" && c.architecture !== "flutter.bloc-pattern") messages.push(message("block", "bloc-requires-pattern", id, "flutter_bloc requires the BLoC architecture recipe.", ["flutter.bloc-pattern"]));
    if (c.architecture === "flutter.bloc-pattern" && c.state !== "flutter.bloc") messages.push(message("block", "bloc-pattern-requires-library", id, "The BLoC architecture recipe requires flutter_bloc.", ["flutter.bloc"]));
    if (platformId === "web" && c.framework === "web.vite" && c.database) {
      messages.push(message("block", "spa-database-needs-api", id, "A browser-only Vite app must not connect directly to a server database. Assign the database to a separate API target instead.", ["api.fastapi", "api.nestjs"]));
    }
    if (platformId === "api" && c.framework === "api.spring" && c.database === "data.sqlite") {
      messages.push(message("block", "spring-sqlite-dialect-unavailable", id, "The packaged Spring/JPA recipe does not include a reviewed SQLite dialect. Choose PostgreSQL/MySQL or another API framework.", ["data.postgresql", "data.mysql", "api.fastapi"]));
    }
    if (platformId === "ios" && hostPlatform !== "macos") messages.push(message("warning", "macos-required-for-ios-generation", id, "iOS choices can be planned here, but Xcode generation and build verification require macOS."));
    if (platformId === "desktop" && c.framework === "desktop.electron") messages.push(message("warning", "electron-forge-vite-experimental", id, "Electron Forge's Vite plugin is experimental; review its current release and generated build on every target OS."));
    const versions = requirements.platformVersions?.[id] || {};
    if (platformId === "ios" && versions.iosDeploymentTarget !== undefined && Number(versions.iosDeploymentTarget) < 17) {
      messages.push(message("block", "ios17-required", id, "The SwiftUI Observation/SwiftData recipe requires iOS 17 or later.", ["17.0"]));
    }
    if (platformId === "expo" && versions.expoSdk !== undefined && Number(versions.expoSdk) !== 58) {
      messages.push(message("block", "expo-sdk-mismatch", id, "The packaged Expo recipe targets SDK 58. Select that SDK or request a separately verified recipe.", ["58"]));
    }
    if (platformId === "expo" && versions.nodeMajor !== undefined && Number(versions.nodeMajor) < 22) {
      messages.push(message("block", "expo-node-too-old", id, "Expo SDK 58 requires Node.js 22.13 or newer.", ["22.13+"]));
    }
    if (platformId === "expo" && Number(versions.nodeMajor) === 22 && versions.nodeMinor !== undefined && Number(versions.nodeMinor) < 13) {
      messages.push(message("block", "expo-node-too-old", id, "Expo SDK 58 requires Node.js 22.13 or newer.", ["22.13+"]));
    }
    if (["web", "desktop"].includes(platformId) && versions.nodeMajor !== undefined) {
      const major = Number(versions.nodeMajor), minor = Number(versions.nodeMinor ?? 0);
      if (major < 22 || major === 22 && minor < 13 || major % 2 === 1) messages.push(message("block", "node-test-toolchain-unsupported", id, "The packaged Vite 8 and Vitest 5 recipe requires a supported Node.js 22.13+ release.", ["22.13+", "24.x"]));
    }
    if (platformId === "api" && c.framework === "api.aspnet" && versions.dotnetMajor !== undefined && Number(versions.dotnetMajor) !== 10) {
      messages.push(message("block", "dotnet-sdk-mismatch", id, "The ASP.NET Core recipe targets .NET 10 LTS.", ["10"]));
    }
    if (platformId === "api" && c.framework === "api.go" && versions.goMinor !== undefined && Number(versions.goMinor) < 27) {
      messages.push(message("block", "go-toolchain-too-old", id, "The Go module baseline is Go 1.27.", ["1.27+"]));
    }
    if (platformId === "api" && c.framework === "api.spring" && versions.javaMajor !== undefined && Number(versions.javaMajor) < 17) {
      messages.push(message("block", "spring-java-too-old", id, "Spring Boot 3.5.16 requires Java 17 or newer.", ["17+"]));
    }
    if (platformId === "android" && versions.androidMinSdk !== undefined && Number(versions.androidMinSdk) < 26) {
      messages.push(message("block", "android-min-sdk-mismatch", id, "The packaged Android recipe targets minSdk 26; a lower target needs a separately tested recipe.", ["26"]));
    }
    if (platformId === "flutter" && versions.dartSdk !== undefined && Number(versions.dartSdk) < 3.5) {
      messages.push(message("block", "flutter-dart-too-old", id, "The packaged Flutter recipe requires Dart 3.5 or newer.", ["3.5+"]));
    }
    if (c.auth === "security.oidc") messages.push(message("warning", "oidc-provider-required", id, "OIDC integration needs a reviewed issuer, client ID, redirect URI, and platform-specific PKCE or server flow."));
    if (Array.isArray(c.delivery) && c.delivery.includes("delivery.github-actions") && requirements.collaborationHost !== "github") {
      messages.push(message("block", "github-host-required", id, "GitHub Actions requires an explicit GitHub collaboration-host choice."));
    }
    if (Array.isArray(c.delivery) && c.delivery.includes("delivery.docker-compose") && ["android", "expo", "flutter", "ios", "desktop"].includes(platformId)) {
      messages.push(message("block", "compose-not-app-runtime", id, "Compose can run a backend or database service, not the native client app itself."));
    }
    if (target.customChoices.some((choice) => choice.replacesId && Object.values(c).flat().includes(choice.replacesId))) {
      messages.push(message("block", "custom-replacement-conflict", id, "A custom replacement and its replaced catalogue ID cannot both be active."));
    }
  }
  const existingFiles = Array.isArray(inventory.files) ? inventory.files : [];
  if (inventory.state === "existing") {
    for (const target of targets) {
      if (safeTargetPath(target.path) && existingFiles.some((file) => target.path === "." || file === target.path || file.startsWith(`${target.path}/`))) {
        messages.push(message("warning", "existing-target-preserve", target.id, "Existing files in this target must be preserved; generation needs a path-specific migration review."));
      }
    }
  }
  return {
    status: messages.some((item) => item.status === "block") ? "block" : messages.some((item) => item.status === "warning") ? "warning" : "pass",
    schemaVersion: PLATFORM_SELECTION_VERSION, catalogVersion: PLATFORM_CATALOG_VERSION, hostPlatform,
    targets, messages: messages.length ? messages : [message("pass", "validated", null, "The platform selection passed.")]
  };
}

export function targetFile(target, relative) {
  return path.posix.join(target.path === "." ? "" : target.path, relative);
}
