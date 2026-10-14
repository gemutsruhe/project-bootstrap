import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { handleRequest, startStdioServer } from "../src/index.js";

test("MCP initialize exposes a tool-capable local server", async () => {
  const result = await handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26" }
  });
  assert.equal(result.result.serverInfo.name, "project-bootstrap");
  assert.deepEqual(result.result.capabilities, { tools: {} });
});

test("MCP lists read-only planning tools", async () => {
  const result = await handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = result.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, ["inspect_workspace", "list_catalog", "recommend", "validate_selection", "create_plan", "check_updates"]);
});

test("MCP tool errors remain structured and cannot write files", async () => {
  const result = await handleRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "create_plan", arguments: { selectedIds: ["unknown.choice"] } }
  });
  assert.equal(result.result.isError, false);
  assert.equal(result.result.structuredContent.status, "blocked");
  assert.equal(result.result.structuredContent.artifacts.length, 0);
});

test("stdio runtime accepts newline-delimited MCP requests", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let response = "";
  output.setEncoding("utf8");
  output.on("data", (chunk) => { response += chunk; });
  startStdioServer(input, output);
  input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list" })}\n`);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const payload = JSON.parse(response.trim());
  assert.equal(payload.id, 4);
  assert.equal(payload.result.tools[0].name, "inspect_workspace");
});
