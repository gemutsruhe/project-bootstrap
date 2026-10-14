import { loadCatalog } from "../server/src/core.js";

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

if (problems.length) throw new Error(`Catalogue validation failed:\n${problems.join("\n")}`);
process.stdout.write(`Validated ${entries.length} catalogue entries.\n`);
