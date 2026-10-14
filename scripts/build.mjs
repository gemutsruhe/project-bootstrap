import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "server", "src");
const destination = path.join(root, "plugins", "project-bootstrap", "server", "dist");
const checkOnly = process.argv.includes("--check");

async function filesEqual(left, right) {
  try {
    return (await readFile(left, "utf8")) === (await readFile(right, "utf8"));
  } catch {
    return false;
  }
}

if (checkOnly) {
  const expected = ["core.js", "index.js"];
  const stale = [];
  for (const file of expected) {
    if (!(await filesEqual(path.join(source, file), path.join(destination, file)))) stale.push(file);
  }
  if (stale.length) throw new Error(`Packaged MCP runtime is stale: ${stale.join(", ")}. Run node scripts/build.mjs.`);
  process.stdout.write("Packaged MCP runtime is current.\n");
} else {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true });
  await writeFile(path.join(destination, "package.json"), '{"type":"module"}\n');
  process.stdout.write("Packaged local MCP runtime.\n");
}
