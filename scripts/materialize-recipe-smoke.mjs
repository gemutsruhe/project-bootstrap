// CI-only helper: materialize a reviewed recipe in a fresh OS temp directory.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, relative, sep, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { validatePlatformSelection } from "../server/src/platform-selection.js";
import { renderPlatformRecipe } from "../server/src/platform-recipes.js";

const [platformId, ...rawChoices] = process.argv.slice(2);
const output = process.env.RECIPE_OUTPUT_DIR;
const tempRoots = [tmpdir(), process.env.RUNNER_TEMP].filter(Boolean).map((item) => resolve(item));
const destination = output && resolve(output);
if (!platformId || !destination || !isAbsolute(output) || !tempRoots.some((root) => destination.startsWith(`${root}${sep}`)) || existsSync(destination)) {
  throw new Error("Provide a platform and a fresh absolute RECIPE_OUTPUT_DIR beneath the OS or CI runner temp directory.");
}
const choices = Object.fromEntries(rawChoices.map((entry) => {
  const separator = entry.indexOf("=");
  if (separator < 1 || separator === entry.length - 1) throw new Error(`Expected slot=option-id, got: ${entry}`);
  return [entry.slice(0, separator), entry.slice(separator + 1)];
}));
const selection = { version: 2, targets: [{ id: "smoke", platformId, path: ".", choices, useDefaults: true }] };
const validation = validatePlatformSelection(selection, { hostPlatform: process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux" });
if (validation.status === "block") throw new Error(JSON.stringify(validation.messages));
const recipe = renderPlatformRecipe(validation.targets[0]);
if (platformId === "flutter") {
  const created = spawnSync("flutter", ["create", "--no-pub", "--empty", "--project-name", "smoke", destination], { stdio: "inherit", shell: process.platform === "win32" });
  if (created.status !== 0) throw new Error(`flutter create failed: ${created.status}`);
} else mkdirSync(destination, { recursive: true });
for (const item of recipe.artifacts) {
  const file = resolve(destination, item.path);
  if (relative(destination, file).startsWith("..") || !file.startsWith(`${destination}${sep}`)) throw new Error(`Unsafe recipe path: ${item.path}`);
  mkdirSync(resolve(file, ".."), { recursive: true });
  const generatorOwned = platformId === "flutter" && ["pubspec.yaml", "lib/main.dart"].includes(item.path);
  writeFileSync(file, item.content, { flag: generatorOwned ? "w" : "wx" });
}
console.log(`Materialized ${platformId} ${JSON.stringify(choices)} in ${destination}`);
