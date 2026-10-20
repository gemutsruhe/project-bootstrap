import { promises as fs } from "node:fs";
import { CATALOG_EXPLORER_RESOURCE_URI, PLUGIN_VERSION, WORKSPACE_GUIDE_CONFIGURATOR_RESOURCE_URI, getToolDefinitions, invokeTool } from "./core.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_EXPLORER_MIME_TYPE = "text/html;profile=mcp-app";
const MAINTENANCE_TOOL_NAMES = new Set(["inspect_workspace", "assess_implementation"]);

export function configuredServerName(argv = process.argv) {
  const flagIndex = argv.indexOf("--server-name");
  const requestedName = flagIndex === -1 ? undefined : argv[flagIndex + 1];
  return requestedName === "project-maintenance" ? requestedName : "project-bootstrap";
}

export function configuredServerVersion(argv = process.argv) {
  const flagIndex = argv.indexOf("--server-version");
  const requestedVersion = flagIndex === -1 ? undefined : argv[flagIndex + 1];
  return typeof requestedVersion === "string" && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(requestedVersion)
    ? requestedVersion
    : PLUGIN_VERSION;
}

export function exposedToolDefinitions(serverName = configuredServerName()) {
  const tools = getToolDefinitions();
  return serverName === "project-maintenance"
    ? tools.filter((tool) => MAINTENANCE_TOOL_NAMES.has(tool.name))
    : tools;
}

function catalogExplorerFiles() {
  return [
    path.resolve(HERE, "../../ui/catalog-explorer-v1.html"),
    path.resolve(HERE, "../../plugins/project-bootstrap/ui/catalog-explorer-v1.html")
  ];
}

function workspaceGuideConfiguratorFiles() {
  return [
    path.resolve(HERE, "../../ui/workspace-guide-configurator-v1.html"),
    path.resolve(HERE, "../../plugins/project-bootstrap/ui/workspace-guide-configurator-v1.html")
  ];
}

export function getResourceDefinitions() {
  return [
    {
      uri: CATALOG_EXPLORER_RESOURCE_URI,
      name: "Project Bootstrap Catalog Explorer",
      description: "Interactive comparison of packaged Markdown catalogue candidates.",
      mimeType: CATALOG_EXPLORER_MIME_TYPE
    },
    {
      uri: WORKSPACE_GUIDE_CONFIGURATOR_RESOURCE_URI,
      name: "Project Bootstrap Workspace Guide Configurator",
      description: "Interactive configuration of one validated workspace-guide policy at a time.",
      mimeType: CATALOG_EXPLORER_MIME_TYPE
    }
  ];
}

async function loadUiHtml(uri) {
  const files = uri === CATALOG_EXPLORER_RESOURCE_URI
    ? catalogExplorerFiles()
    : uri === WORKSPACE_GUIDE_CONFIGURATOR_RESOURCE_URI
      ? workspaceGuideConfiguratorFiles()
      : undefined;
  if (!files) throw new Error(`Unknown resource: ${uri}`);
  for (const file of files) {
    try {
      return await fs.readFile(file, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error("Project Bootstrap UI resource could not be located.");
}

export async function readResource(uri) {
  if (![CATALOG_EXPLORER_RESOURCE_URI, WORKSPACE_GUIDE_CONFIGURATOR_RESOURCE_URI].includes(uri)) throw new Error(`Unknown resource: ${uri}`);
  return {
    contents: [{
      uri,
      mimeType: CATALOG_EXPLORER_MIME_TYPE,
      text: await loadUiHtml(uri),
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
  const serverName = configuredServerName();
  if (method === "initialize") {
    return response(id, {
      protocolVersion: params.protocolVersion || "2025-03-26",
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: serverName, version: configuredServerVersion() }
    });
  }
  if (method === "notifications/initialized") return undefined;
  if (method === "tools/list") return response(id, { tools: exposedToolDefinitions(serverName) });
  if (method === "resources/list") return response(id, { resources: serverName === "project-maintenance" ? [] : getResourceDefinitions() });
  if (method === "resources/read") {
    if (serverName === "project-maintenance") return rpcError(id, -32601, "Resources are not available in Project Maintenance.");
    try {
      return response(id, await readResource(params.uri));
    } catch (error) {
      return rpcError(id, -32602, error.message);
    }
  }
  if (method === "tools/call") {
    try {
      if (serverName === "project-maintenance" && !MAINTENANCE_TOOL_NAMES.has(params.name)) {
        return rpcError(id, -32601, `Tool not available in Project Maintenance: ${params.name}`);
      }
      const data = await invokeTool(params.name, params.arguments || {});
      const text = params.name === "render_catalog_explorer"
        ? `Catalog Explorer is ready with ${data.entries.length} read-only candidate record(s). Select a candidate and optionally submit a comment to chat.`
        : params.name === "render_workspace_guide_configurator"
          ? `Workspace Guide Configurator is ready for ${data.guide.title}. Adjust the reviewed policy and submit it to chat.`
        : params.name === "submit_catalog_selection"
          ? `Accepted Catalog Explorer selection: ${data.selection.id}. Continue the guided plan from this choice; it is not approval for file changes or commands.`
          : params.name === "submit_workspace_guide_configuration"
            ? `Accepted workspace-guide configuration for ${data.guideKey}. Continue the guided plan from this decision; it is not approval for file changes or commands.`
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
