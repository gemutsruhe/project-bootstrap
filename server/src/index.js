import { PLUGIN_VERSION, getToolDefinitions, invokeTool } from "./core.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

function response(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolResult(data, isError = false) {
  const text = JSON.stringify(data, null, 2);
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
      capabilities: { tools: {} },
      serverInfo: { name: "project-bootstrap", version: PLUGIN_VERSION }
    });
  }
  if (method === "notifications/initialized") return undefined;
  if (method === "tools/list") return response(id, { tools: getToolDefinitions() });
  if (method === "tools/call") {
    try {
      const data = await invokeTool(params.name, params.arguments || {});
      return response(id, toolResult(data));
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
