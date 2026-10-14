import { promises as fs } from "node:fs";
import { CATALOG_EXPLORER_RESOURCE_URI, PLUGIN_VERSION, getToolDefinitions, invokeTool } from "./core.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_EXPLORER_MIME_TYPE = "text/html;profile=mcp-app";

function catalogExplorerFile() {
  return [
    path.resolve(HERE, "../../ui/catalog-explorer-v1.html"),
    path.resolve(HERE, "../../plugins/project-bootstrap/ui/catalog-explorer-v1.html")
  ];
}

export function getResourceDefinitions() {
  return [{
    uri: CATALOG_EXPLORER_RESOURCE_URI,
    name: "Project Bootstrap Catalog Explorer",
    description: "Interactive comparison of packaged Markdown catalogue candidates.",
    mimeType: CATALOG_EXPLORER_MIME_TYPE
  }];
}

async function loadCatalogExplorerHtml() {
  for (const file of catalogExplorerFile()) {
    try {
      return await fs.readFile(file, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error("Catalog Explorer UI resource could not be located.");
}

export async function readResource(uri) {
  if (uri !== CATALOG_EXPLORER_RESOURCE_URI) throw new Error(`Unknown resource: ${uri}`);
  return {
    contents: [{
      uri,
      mimeType: CATALOG_EXPLORER_MIME_TYPE,
      text: await loadCatalogExplorerHtml(),
      _meta: { ui: { prefersBorder: true } }
    }]
  };
}

function response(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolResult(data, isError = false, text = JSON.stringify(data, null, 2)) {
  return {
    content: [{ type: "text", text }],
    structuredContent: data,
    isError
  };
}

export async function handleRequest(request) {
  const { id, method, params = {} } = request;
  if (method === "initialize") {
    return response(id, {
      protocolVersion: params.protocolVersion || "2025-03-26",
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: "project-bootstrap", version: PLUGIN_VERSION }
    });
  }
  if (method === "notifications/initialized") return undefined;
  if (method === "tools/list") return response(id, { tools: getToolDefinitions() });
  if (method === "resources/list") return response(id, { resources: getResourceDefinitions() });
  if (method === "resources/read") {
    try {
      return response(id, await readResource(params.uri));
    } catch (error) {
      return rpcError(id, -32602, error.message);
    }
  }
  if (method === "tools/call") {
    try {
      const data = await invokeTool(params.name, params.arguments || {});
      const text = params.name === "render_catalog_explorer"
        ? `Catalog Explorer is ready with ${data.entries.length} read-only candidate record(s). Select a candidate and optionally submit a comment to chat.`
        : undefined;
      return response(id, toolResult(data, false, text));
    } catch (error) {
      return response(id, toolResult({ error: error.message }, true));
    }
  }
  if (id === undefined) return undefined;
  return rpcError(id, -32601, `Method not found: ${method}`);
}

export function startStdioServer(input = process.stdin, output = process.stdout) {
  let buffer = "";
  input.setEncoding("utf8");
  input.on("data", async (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let request;
      try {
        request = JSON.parse(line);
      } catch {
        output.write(`${JSON.stringify(rpcError(null, -32700, "Parse error"))}\n`);
        continue;
      }
      const result = await handleRequest(request);
      if (result) output.write(`${JSON.stringify(result)}\n`);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startStdioServer();
}
