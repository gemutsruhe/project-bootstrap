import { loadCatalog } from "../server/src/core.js";
import { PLATFORM_CATALOG } from "../server/src/platform-catalog.js";
import { validatePlatformSelection } from "../server/src/platform-selection.js";
import { renderPlatformRecipe } from "../server/src/platform-recipes.js";

const entries = await loadCatalog();
const ids = new Set(entries.map((entry) => entry.attributes.id));
const problems = [];

for (const entry of entries) {
  const { attributes, relativePath } = entry;
  for (const field of ["id", "kind", "title_en", "summary_en"]) {
    if (!attributes[field]) problems.push(`${relativePath}: missing ${field}`);
  }
  for (const relation of ["requires", "requires_any", "conflicts", "warns_with", "suggests"]) {
    const values = Array.isArray(attributes[relation]) ? attributes[relation] : attributes[relation] ? [attributes[relation]] : [];
    for (const value of values) if (!ids.has(value)) problems.push(`${relativePath}: ${relation} references unknown ID ${value}`);
  }
}

const platformIds = new Set();
for (const [platformId, platform] of Object.entries(PLATFORM_CATALOG)) {
  for (const [slotKey, slot] of Object.entries(platform.slots)) {
    if (slot.required && !slot.options.some((choice) => choice.id === slot.defaultId)) problems.push(`${platformId}.${slotKey}: missing default option`);
    for (const choice of slot.options) {
      if (platformIds.has(choice.id) && !["data.postgresql", "data.sqlite", "data.mysql", "security.oidc", "observability.opentelemetry", "delivery.docker-compose", "delivery.github-actions"].includes(choice.id)) problems.push(`duplicate platform option: ${choice.id}`);
      platformIds.add(choice.id);
      if (!choice.versionBaseline || !choice.reason || !["verified-recipe", "recipe-preview", "conditional-review"].includes(choice.generation)) problems.push(`${choice.id}: incomplete release metadata`);
      if (!choice.evidence.length || choice.evidence.some((source) => !/^https:\/\//.test(source.url) || !/^\d{4}-\d{2}-\d{2}$/.test(source.observedAt))) problems.push(`${choice.id}: invalid evidence`);
    }
  }
  const checked = validatePlatformSelection({ version: 2, targets: [{ id: "check", platformId, path: "app", choices: {}, useDefaults: true }] }, { hostPlatform: "macos" });
  if (checked.status === "block") problems.push(`${platformId}: invalid default combination`);
  else {
    const recipe = renderPlatformRecipe(checked.targets[0]);
    if (!recipe.artifacts.some((item) => !item.path.endsWith(".md")) || recipe.checks.length === 0) problems.push(`${platformId}: missing runtime recipe or verification`);
    const paths = recipe.artifacts.map((item) => item.path);
    if (new Set(paths).size !== paths.length) problems.push(`${platformId}: duplicate recipe artifact path`);
  }
}

if (problems.length) throw new Error(`Catalogue validation failed:\n${problems.join("\n")}`);
process.stdout.write(`Validated ${entries.length} legacy catalogue entries and ${platformIds.size} platform option IDs.\n`);
