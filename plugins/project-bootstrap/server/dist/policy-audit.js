import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const MAX_DOCUMENT_BYTES = 128_000;
const MAX_TOTAL_BYTES = 4_000_000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_AUTO_DISCOVERY_FILES = 2_000;
const MAX_AUTO_DISCOVERY_DEPTH = 6;
const TOKEN_VERSION = 1;
const POLICY_DOCUMENT_EXTENSION = /\.(?:md|mdx|txt)$/i;
const EXTERNAL_REFERENCE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
const AUTO_DISCOVERY_IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".cache", "vendor"]);
const AUTO_POLICY_DOCUMENT_SCORES = new Map([
  ["agents.md", 100],
  ["security.md", 95],
  ["contributing.md", 90],
  ["code_of_conduct.md", 85],
  ["policy.md", 90],
  ["policies.md", 90],
  ["rules.md", 90],
  ["standards.md", 90],
  ["guidelines.md", 85],
  ["instructions.md", 85],
  ["release.md", 65],
  ["operations.md", 65],
  ["runbook.md", 65],
  ["deployment.md", 60],
  ["architecture.md", 50]
]);
const AUTO_POLICY_DOCUMENT_KEYWORDS = /(?:^|[-_.])(?:policy|policies|rule|rules|standard|standards|guideline|guidelines|instruction|instructions|security|contributing|governance|compliance|release|operation|operations|runbook|deployment)(?:[-_.]|$)/i;
const POLICY_LANGUAGE = /\b(?:must|should|require(?:d)?|prohibit(?:ed)?|never|always|do not|don't|only|avoid|ensure|before|after|mandatory)\b|해야(?:\s*한다|만\s*한다|\s*합니다)?|하십시오|금지|반드시|절대|하지\s*마|하지\s*않(?:는다|습니다)|요구|허용|검증|승인|실행/i;
const EXCEPTION_LANGUAGE = /\b(?:except|unless|only if|otherwise)\b|제외|예외|단,|경우에만|하지\s*않아도/i;

function isWithin(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toPosix(value) {
  return value.replaceAll(path.sep, "/");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function policyError(reason, detail) {
  return { status: "blocked", reason, ...(detail ? { detail } : {}) };
}

function validateRelativePath(value, label = "Policy document") {
  if (typeof value !== "string" || !value.trim() || value.includes("\\") || value.includes("\0") || value.startsWith("/")) {
    throw new Error(`${label} paths must be non-empty workspace-relative POSIX paths.`);
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${label} paths cannot contain empty, dot, or parent segments.`);
  }
  return value;
}

function normalizePolicyAudit(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("policyAudit must be an object.");
  }
  const autoScope = options.scope === "auto";
  if (options.scope !== undefined && !autoScope) {
    throw new Error('policyAudit.scope must be "auto" when provided.');
  }
  const hasEntryDocuments = options.entryDocuments !== undefined;
  if (hasEntryDocuments === autoScope) {
    throw new Error('Provide policyAudit.entryDocuments or policyAudit.scope: "auto", but not both.');
  }
  let entryDocuments;
  if (hasEntryDocuments) {
    if (!Array.isArray(options.entryDocuments) || options.entryDocuments.length < 1 || options.entryDocuments.length > 20) {
      throw new Error("policyAudit.entryDocuments must contain between 1 and 20 policy documents.");
    }
    entryDocuments = [...new Set(options.entryDocuments.map((entry) => validateRelativePath(entry)))].sort();
    if (entryDocuments.some((entry) => !POLICY_DOCUMENT_EXTENSION.test(entry))) {
      throw new Error("Policy audit entry documents must be Markdown or text files.");
    }
  }
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(`policyAudit.pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}.`);
  }
  if (options.pageToken !== undefined && (typeof options.pageToken !== "string" || !options.pageToken.trim())) {
    throw new Error("policyAudit.pageToken must be a non-empty string when provided.");
  }
  if (options.includeConfiguration !== undefined && options.includeConfiguration !== "safe-summary") {
    throw new Error('policyAudit.includeConfiguration must be "safe-summary" when provided.');
  }
  return {
    entryDocuments,
    scope: autoScope ? "auto" : "explicit",
    pageSize,
    pageToken: options.pageToken,
    includeConfiguration: options.includeConfiguration ?? "safe-summary"
  };
}

function autoPolicyDocumentScore(documentPath) {
  const parts = documentPath.toLowerCase().split("/");
  const fileName = parts.at(-1);
  const namedScore = AUTO_POLICY_DOCUMENT_SCORES.get(fileName);
  if (namedScore) return namedScore + (parts[0] === "docs" ? 5 : 0);
  if (fileName === "readme.md" && parts.length === 1) return 55;
  const stem = fileName.replace(POLICY_DOCUMENT_EXTENSION, "");
  if (!AUTO_POLICY_DOCUMENT_KEYWORDS.test(stem)) return 0;
  return 70 + (parts[0] === "docs" ? 5 : 0);
}

async function discoverPolicyEntryDocuments(root) {
  const candidates = [];
  let inspectedEntries = 0;

  async function visit(directory, relativeDirectory, depth) {
    if (depth > MAX_AUTO_DISCOVERY_DEPTH) return { status: "ready" };
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return policyError("policy-document-auto-discovery-unreadable", { path: relativeDirectory || "." });
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      inspectedEntries += 1;
      if (inspectedEntries > MAX_AUTO_DISCOVERY_FILES) {
        return policyError("policy-document-auto-discovery-limit", { maxEntries: MAX_AUTO_DISCOVERY_FILES });
      }
      const relative = toPosix(path.join(relativeDirectory, entry.name));
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (AUTO_DISCOVERY_IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) continue;
        const result = await visit(absolute, relative, depth + 1);
        if (result.status === "blocked") return result;
        continue;
      }
      if (!entry.isFile() || !POLICY_DOCUMENT_EXTENSION.test(entry.name)) continue;
      const score = autoPolicyDocumentScore(relative);
      if (score) candidates.push({ path: relative, score });
    }
    return { status: "ready" };
  }

  const result = await visit(root, "", 0);
  if (result.status === "blocked") return result;
  candidates.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  if (candidates.length === 0) {
    return policyError("policy-document-auto-discovery-empty", { message: "No conventionally named policy or instruction documents were found." });
  }
  if (candidates.length > 20) {
    return policyError("policy-document-auto-discovery-too-many", { candidateCount: candidates.length, maxEntryDocuments: 20 });
  }
  return { status: "ready", entryDocuments: candidates.map((candidate) => candidate.path) };
}

function decodePageToken(token) {
  try {
    const value = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    if (value?.version !== TOKEN_VERSION || !Number.isInteger(value.offset) || value.offset < 0 || typeof value.snapshot !== "string" || !Array.isArray(value.entryDocuments)) {
      throw new Error("invalid token");
    }
    return value;
  } catch {
    throw new Error("policyAudit.pageToken is invalid.");
  }
}

function encodePageToken({ entryDocuments, snapshot, offset }) {
  return Buffer.from(JSON.stringify({ version: TOKEN_VERSION, entryDocuments, snapshot, offset }), "utf8").toString("base64url");
}

function sentenceSegments(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const result = [];
  let start = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    if (!/[.!?。！？]/.test(normalized[index])) continue;
    const next = normalized[index + 1];
    if (next && !/\s/.test(next)) continue;
    result.push(normalized.slice(start, index + 1).trim());
    start = index + 1;
    while (/\s/.test(normalized[start] || "")) start += 1;
    index = start - 1;
  }
  const remainder = normalized.slice(start).trim();
  if (remainder) result.push(remainder);
  return result;
}

function classify(text) {
  if (EXCEPTION_LANGUAGE.test(text)) return "exception";
  if (POLICY_LANGUAGE.test(text)) return "policy";
  return "context";
}

function headingContext(headings) {
  return headings.filter(Boolean).map((entry) => ({ level: entry.level, text: entry.text }));
}

function splitPolicyItems(document) {
  const lines = document.content.replace(/\r\n/g, "\n").split("\n");
  const headings = [];
  const items = [];
  let paragraph = [];
  let inFence = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const first = paragraph[0];
    const last = paragraph.at(-1);
    const text = paragraph.map((entry) => entry.text.trim()).join(" ");
    for (const sentence of sentenceSegments(text)) {
      items.push({
        path: document.path,
        startLine: first.line,
        endLine: last.line,
        text: sentence,
        classification: classify(sentence),
        headings: headingContext(headings)
      });
    }
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (/^\s*```/.test(line)) {
      flushParagraph();
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      headings.length = level - 1;
      headings[level - 1] = { level, text: heading[2].trim() };
      continue;
    }
    const list = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+?)\s*$/);
    if (list) {
      flushParagraph();
      const text = list[1].trim();
      items.push({
        path: document.path,
        startLine: lineNumber,
        endLine: lineNumber,
        text,
        classification: classify(text),
        headings: headingContext(headings)
      });
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraph.push({ line: lineNumber, text: line });
  }
  flushParagraph();

  const perDocument = new Map();
  const lastPolicyByContext = new Map();
  for (const item of items) {
    const ordinal = (perDocument.get(item.path) || 0) + 1;
    perDocument.set(item.path, ordinal);
    item.id = `${item.path}#L${item.startLine}-L${item.endLine}-${ordinal}`;
    item.relatedItemIds = [];
    const contextKey = `${item.path}\0${item.headings.map((entry) => `${entry.level}:${entry.text}`).join("/")}`;
    if (item.classification === "policy") lastPolicyByContext.set(contextKey, item);
    if (item.classification === "exception") {
      const related = lastPolicyByContext.get(contextKey);
      if (related) {
        item.relatedItemIds.push(related.id);
        related.relatedItemIds.push(item.id);
      }
    }
  }
  return items;
}

function extractPolicyReferences(content, sourcePath) {
  const rawTargets = [];
  for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)) rawTargets.push({ target: match[1], relativeToSource: true });
  for (const match of content.matchAll(/`([^`\r\n]+)`/g)) rawTargets.push({ target: match[1], relativeToSource: false });
  const sourceDirectory = path.posix.dirname(sourcePath);
  return [...new Set(rawTargets.flatMap(({ target: raw, relativeToSource }) => {
    const target = raw.split(/[?#]/, 1)[0].trim();
    if (!target || EXTERNAL_REFERENCE.test(target) || !POLICY_DOCUMENT_EXTENSION.test(target) || target.includes("\\")) return [];
    const resolved = path.posix.normalize(relativeToSource ? path.posix.join(sourceDirectory === "." ? "" : sourceDirectory, target) : target);
    return [resolved];
  }))].sort();
}

async function collectPolicyDocuments(root, entryDocuments) {
  const documents = new Map();
  const visiting = new Set();
  let bytesRead = 0;

  async function visit(documentPath, parent) {
    if (visiting.has(documentPath)) return policyError("policy-document-cycle", { path: documentPath, from: parent });
    if (documents.has(documentPath)) return { status: "ready" };
    const absolute = path.resolve(root, documentPath);
    if (!isWithin(absolute, root)) return policyError("policy-document-outside-workspace", { path: documentPath, from: parent });
    visiting.add(documentPath);
    try {
      let stat;
      let content;
      try {
        stat = await fs.stat(absolute);
        if (!stat.isFile()) return policyError("policy-document-missing", { path: documentPath, from: parent });
        if (stat.size > MAX_DOCUMENT_BYTES || bytesRead + stat.size > MAX_TOTAL_BYTES) {
          return policyError("policy-document-size-limit", { path: documentPath, maxDocumentBytes: MAX_DOCUMENT_BYTES, maxTotalBytes: MAX_TOTAL_BYTES });
        }
        content = await fs.readFile(absolute, "utf8");
      } catch (error) {
        return policyError(error?.code === "ENOENT" ? "policy-document-missing" : "policy-document-unreadable", { path: documentPath, from: parent });
      }
      const bytes = Buffer.byteLength(content);
      if (bytes > MAX_DOCUMENT_BYTES || bytesRead + bytes > MAX_TOTAL_BYTES) {
        return policyError("policy-document-size-limit", { path: documentPath, maxDocumentBytes: MAX_DOCUMENT_BYTES, maxTotalBytes: MAX_TOTAL_BYTES });
      }
      bytesRead += bytes;
      const document = { path: documentPath, bytes, digest: sha256(content), content };
      documents.set(documentPath, document);
      for (const reference of extractPolicyReferences(content, documentPath)) {
        const result = await visit(reference, documentPath);
        if (result.status === "blocked") return result;
      }
      return { status: "ready" };
    } finally {
      visiting.delete(documentPath);
    }
  }

  for (const entryDocument of entryDocuments) {
    const result = await visit(entryDocument, undefined);
    if (result.status === "blocked") return result;
  }
  return { status: "ready", documents: [...documents.values()].sort((left, right) => left.path.localeCompare(right.path)) };
}

export async function createPolicyAudit(root, options, configuration) {
  const normalized = normalizePolicyAudit(options);
  let entryDocuments = normalized.entryDocuments;
  let documentDiscovery;
  if (normalized.scope === "auto") {
    const discovered = await discoverPolicyEntryDocuments(root);
    if (discovered.status === "blocked") return { ...discovered, scope: "auto" };
    entryDocuments = discovered.entryDocuments;
    documentDiscovery = { mode: "auto", selectedEntryDocuments: entryDocuments };
  }
  const audit = { ...normalized, entryDocuments };
  const collected = await collectPolicyDocuments(root, audit.entryDocuments);
  if (collected.status === "blocked") {
    return { ...collected, entryDocuments: audit.entryDocuments, ...(documentDiscovery ? { documentDiscovery } : {}) };
  }

  const snapshot = sha256(collected.documents.map((document) => `${document.path}\0${document.digest}`).join("\n"));
  let offset = 0;
  if (audit.pageToken) {
    const token = decodePageToken(audit.pageToken);
    if (JSON.stringify(token.entryDocuments) !== JSON.stringify(audit.entryDocuments) || token.snapshot !== snapshot) {
      return policyError("policy-audit-page-stale", { entryDocuments: audit.entryDocuments });
    }
    offset = token.offset;
  }

  const allItems = collected.documents.flatMap(splitPolicyItems);
  if (offset > allItems.length) return policyError("policy-audit-page-token-out-of-range", { totalItems: allItems.length });
  const items = allItems.slice(offset, offset + audit.pageSize);
  const nextOffset = offset + items.length;
  return {
    status: "ready",
    entryDocuments: audit.entryDocuments,
    entryDocumentSource: audit.scope,
    ...(documentDiscovery ? { documentDiscovery } : {}),
    documents: collected.documents.map(({ path: documentPath, bytes, digest }) => ({ path: documentPath, status: "collected", bytes, digest })),
    totalItems: allItems.length,
    page: { offset, pageSize: audit.pageSize, returnedItems: items.length, totalItems: allItems.length },
    items,
    nextPageToken: nextOffset < allItems.length ? encodePageToken({ entryDocuments: audit.entryDocuments, snapshot, offset: nextOffset }) : null,
    ...(audit.includeConfiguration === "safe-summary" ? { configuration } : {})
  };
}
