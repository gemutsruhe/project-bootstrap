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
  assert.deepEqual(result.result.capabilities, { tools: {}, resources: {} });
});

test("MCP lists read-only planning tools and the Catalog Explorer UI tool", async () => {
  const result = await handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = result.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, ["inspect_workspace", "list_catalog", "render_catalog_explorer", "submit_catalog_selection", "recommend", "validate_selection", "list_workspace_guide_policies", "create_plan", "check_updates"]);
  const explorer = result.result.tools.find((tool) => tool.name === "render_catalog_explorer");
  assert.equal(explorer._meta.ui.resourceUri, "ui://project-bootstrap/catalog-explorer-v2.html");
  assert.equal(explorer.annotations.readOnlyHint, true);
  const submit = result.result.tools.find((tool) => tool.name === "submit_catalog_selection");
  assert.equal(submit.annotations.readOnlyHint, true);
  assert.deepEqual(submit._meta.ui.visibility, ["model", "app"]);
});

test("MCP exposes the versioned workspace-guide policy catalogue without writes", async () => {
  const result = await handleRequest({
    jsonrpc: "2.0",
    id: 25,
    method: "tools/call",
    params: { name: "list_workspace_guide_policies", arguments: { locale: "ko" } }
  });
  assert.equal(result.result.isError, false);
  assert.equal(result.result.structuredContent.schemaVersion, 2);
  assert.equal(result.result.structuredContent.guides.find((guide) => guide.key === "agents").profiles[0].id, "contextual");
});

test("MCP exposes the Catalog Explorer as a local MCP Apps resource", async () => {
  const listed = await handleRequest({ jsonrpc: "2.0", id: 21, method: "resources/list" });
  assert.equal(listed.result.resources.length, 1);
  assert.equal(listed.result.resources[0].mimeType, "text/html;profile=mcp-app");

  const read = await handleRequest({
    jsonrpc: "2.0",
    id: 22,
    method: "resources/read",
    params: { uri: "ui://project-bootstrap/catalog-explorer-v2.html" }
  });
  const resource = read.result.contents[0];
  assert.equal(resource._meta.ui.prefersBorder, true);
  assert.match(resource.text, /ui\/initialize/);
  assert.match(resource.text, /ui\/update-model-context/);
  assert.match(resource.text, /ui\/message/);
  assert.match(resource.text, /submit_catalog_selection/);
  assert.match(resource.text, /setWidgetState/);
});

test("Catalog Explorer selection tool returns structured continuation input without writes", async () => {
  const result = await handleRequest({
    jsonrpc: "2.0",
    id: 24,
    method: "tools/call",
    params: {
      name: "submit_catalog_selection",
      arguments: { candidateIds: ["profile.web-fullstack", "profile.mobile-app"], selectedId: "profile.mobile-app", locale: "ko" }
    }
  });
  assert.equal(result.result.isError, false);
  assert.equal(result.result.structuredContent.selection.id, "profile.mobile-app");
  assert.equal(result.result.structuredContent.continuation.replaceOnlyCurrentDecision, true);
  assert.match(result.result.content[0].text, /Continue the guided plan/);
});

test("Catalog Explorer output is read-only structured data", async () => {
  const result = await handleRequest({
    jsonrpc: "2.0",
    id: 23,
    method: "tools/call",
    params: { name: "render_catalog_explorer", arguments: { candidateIds: ["profile.web-fullstack"], locale: "ko" } }
  });
  assert.equal(result.result.isError, false);
  assert.equal(result.result.structuredContent.entries[0].id, "profile.web-fullstack");
  assert.match(result.result.structuredContent.entries[0].markdown, /^---\n/);
  assert.match(result.result.content[0].text, /Catalog Explorer is ready/);
  assert.doesNotMatch(result.result.content[0].text, /title_ko:/);
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
