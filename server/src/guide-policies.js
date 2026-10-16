export const GUIDE_POLICY_SCHEMA_VERSION = 4;

const policy = (titleEn, titleKo, profiles, fields) => ({ titleEn, titleKo, profiles, fields });

export const GUIDE_POLICY_CATALOG = Object.freeze({
  agents: policy("AGENTS.md", "AGENTS.md", {
    contextual: { labelEn: "Contextual routing", labelKo: "상황별 라우팅", defaults: { routing: "task-relevant", verification: "affected-checks", localScope: "root-only", documentStructure: "auto", codingStyle: "existing-patterns", functionDesign: "single-responsibility", commentStyle: "why-and-invariants" } },
    minimal: { labelEn: "Minimal routing", labelKo: "최소 라우팅", defaults: { routing: "essential-only", verification: "affected-checks", localScope: "root-only", documentStructure: "router", codingStyle: "existing-patterns", functionDesign: "single-responsibility", commentStyle: "minimal" } },
    "strict-governance": { labelEn: "Strict governance", labelKo: "엄격한 거버넌스", defaults: { routing: "relevant-guide-and-plan", verification: "full-suite", localScope: "root-only", documentStructure: "auto", codingStyle: "modular-boundaries", functionDesign: "separate-effects", commentStyle: "why-and-invariants" } },
    custom: { labelEn: "Custom", labelKo: "사용자 정의", defaults: { routing: "task-relevant", verification: "affected-checks", localScope: "root-only", documentStructure: "auto", codingStyle: "existing-patterns", functionDesign: "single-responsibility", commentStyle: "why-and-invariants" } }
  }, {
    routing: ["task-relevant", "essential-only", "relevant-guide-and-plan"],
    verification: ["affected-checks", "full-suite", "custom"],
    localScope: ["root-only", "nested-where-needed"],
    documentStructure: ["auto", "router", "multi-surface", "service-mcp", "sdk-ai", "generated-distribution", "custom"],
    codingStyle: ["existing-patterns", "modular-boundaries", "functional-core", "custom"],
    functionDesign: ["single-responsibility", "separate-effects", "custom"],
    commentStyle: ["why-and-invariants", "minimal", "custom"]
  }),
  architecture: policy("ARCHITECTURE.md", "ARCHITECTURE.md", {
    "decision-focused": { labelEn: "Decision-focused", labelKo: "결정 중심", defaults: { boundaries: "feature-module", decisionTrigger: "cross-cutting" } },
    lightweight: { labelEn: "Lightweight", labelKo: "경량", defaults: { boundaries: "feature-module", decisionTrigger: "public-contract" } },
    controlled: { labelEn: "Controlled", labelKo: "통제형", defaults: { boundaries: "service", decisionTrigger: "cross-cutting" } },
    custom: { labelEn: "Custom", labelKo: "사용자 정의", defaults: { boundaries: "feature-module", decisionTrigger: "cross-cutting" } }
  }, {
    boundaries: ["feature-module", "layer", "service", "package", "mobile-feature", "custom"],
    decisionTrigger: ["public-contract", "cross-cutting", "custom"]
  }),
  team: policy("TEAM_GUIDE.md", "TEAM_GUIDE.md", {
    "small-team": { labelEn: "Small team", labelKo: "소규모 팀", defaults: { ownership: "evolving", handoff: "summary-and-tests", ownershipSource: "guide" } },
    "shared-ownership": { labelEn: "Shared ownership", labelKo: "공동 소유", defaults: { ownership: "shared", handoff: "summary-and-tests", ownershipSource: "guide" } },
    "formal-ownership": { labelEn: "Formal ownership", labelKo: "공식 소유", defaults: { ownership: "formal", handoff: "acceptance", ownershipSource: "codeowners" } },
    custom: { labelEn: "Custom", labelKo: "사용자 정의", defaults: { ownership: "evolving", handoff: "summary-and-tests", ownershipSource: "guide" } }
  }, {
    ownership: ["evolving", "shared", "formal"],
    handoff: ["summary", "summary-and-tests", "acceptance", "custom"],
    ownershipSource: ["codeowners", "guide", "external-tracker", "custom"]
  }),
  plans: policy("PLANS.md", "PLANS.md", {
    "significant-change": { labelEn: "Significant changes", labelKo: "중요 변경", defaults: { trigger: "significant-change", detail: "scope-and-tests", lifecycle: "update-while-implementing" } },
    "broad-planning": { labelEn: "Broad planning", labelKo: "폭넓은 계획", defaults: { trigger: "non-trivial-change", detail: "implementation-and-rollback", lifecycle: "review-before-execution" } },
    "milestone-planning": { labelEn: "Milestone planning", labelKo: "마일스톤 계획", defaults: { trigger: "milestone", detail: "implementation-and-rollback", lifecycle: "review-before-execution" } },
    custom: { labelEn: "Custom", labelKo: "사용자 정의", defaults: { trigger: "significant-change", detail: "scope-and-tests", lifecycle: "update-while-implementing" } }
  }, {
    trigger: ["significant-change", "non-trivial-change", "milestone", "custom"],
    detail: ["scope-and-tests", "implementation-and-rollback", "custom"],
    lifecycle: ["update-while-implementing", "review-before-execution", "custom"]
  }),
  codeReview: policy("CODE_REVIEW.md", "CODE_REVIEW.md", {
    "defect-focused": { labelEn: "Defect-focused", labelKo: "결함 중심", defaults: { priorities: "defects", findingThreshold: "defects-and-followups", evidence: "affected-tests" } },
    "security-focused": { labelEn: "Security-focused", labelKo: "보안 중심", defaults: { priorities: "security", findingThreshold: "defects-and-followups", evidence: "tests-and-manual-checks" } },
    "release-critical": { labelEn: "Release-critical", labelKo: "릴리스 중심", defaults: { priorities: "release", findingThreshold: "defects-and-followups", evidence: "tests-and-manual-checks" } },
    custom: { labelEn: "Custom", labelKo: "사용자 정의", defaults: { priorities: "defects", findingThreshold: "defects-and-followups", evidence: "affected-tests" } }
  }, {
    priorities: ["defects", "security", "release", "custom"],
    findingThreshold: ["blocking-defects", "defects-and-followups", "custom"],
    evidence: ["affected-tests", "tests-and-manual-checks", "custom"]
  }),
  pullRequest: policy(".github/pull_request_template.md", ".github/pull_request_template.md", {
    standard: { labelEn: "Standard", labelKo: "표준", defaults: { issueLinks: "optional", checklist: "none" } },
    minimal: { labelEn: "Minimal", labelKo: "최소", defaults: { issueLinks: "optional", checklist: "none" } },
    "change-controlled": { labelEn: "Change-controlled", labelKo: "변경 통제형", defaults: { issueLinks: "required", checklist: "migration-and-configuration" } },
    custom: { labelEn: "Custom", labelKo: "사용자 정의", defaults: { issueLinks: "optional", checklist: "none" } }
  }, {
    issueLinks: ["optional", "required", "custom"],
    checklist: ["none", "migration-and-configuration", "custom"]
  })
});

const MAX_COMMENT_LENGTH = 2000;

function shortText(value, name, maximum) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`Invalid ${name}.`);
  return value.trim();
}

function relativeScope(value, name) {
  const scope = shortText(value, name, 200).replaceAll("\\", "/").replace(/\/$/, "");
  if (/^[a-z]:|^\/|[\r\n]/i.test(scope) || scope.split("/").includes("..")) throw new Error(`${name} must be a workspace-relative path.`);
  return scope || ".";
}

function normalizeAgentsExtensions(decision) {
  const result = {};
  if (decision.projectContext !== undefined) result.projectContext = shortText(decision.projectContext, "agents.projectContext", 1200);
  for (const key of ["rules", "reviewedCommands"]) {
    if (decision[key] === undefined) continue;
    if (!Array.isArray(decision[key]) || decision[key].length > 20) throw new Error(`agents.${key} must contain at most 20 entries.`);
    result[key] = decision[key].map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Invalid agents.${key} entry.`);
      if (key === "rules") {
        if (Object.keys(entry).some((field) => !["scope", "invariant", "safeAlternative"].includes(field))) throw new Error("Unknown agents.rules field.");
        return { scope: relativeScope(entry.scope, "rule scope"), invariant: shortText(entry.invariant, "rule invariant", 800), safeAlternative: shortText(entry.safeAlternative, "rule safeAlternative", 800) };
      }
      if (Object.keys(entry).some((field) => !["command", "workingDirectory", "kind", "stage", "effects", "covers", "confirmed"].includes(field))) throw new Error("Unknown reviewed command field.");
      if (entry.confirmed !== true) throw new Error("Reviewed commands require explicit user confirmation.");
      const command = shortText(entry.command, "reviewed command", 300);
      if (/[\r\n;&|<>`$]/.test(command)) throw new Error("Reviewed commands must be a single invocation, without shell operators or interpolation.");
      if (!["test", "lint", "typecheck", "build", "verification", "generation", "setup"].includes(entry.kind)) throw new Error("Invalid reviewed command kind.");
      if (!["verification", "setup", "generation"].includes(entry.stage)) throw new Error("Invalid reviewed command stage.");
      if (!Array.isArray(entry.effects) || !entry.effects.length || entry.effects.some((effect) => !["read-only", "unknown", "writes-files", "network", "live-system", "persistent", "publishes", "device"].includes(effect))) throw new Error("Reviewed commands require known effect categories.");
      if (entry.effects.includes("read-only") && entry.effects.some((effect) => ["writes-files", "publishes"].includes(effect))) throw new Error("Contradictory command effects.");
      if (entry.covers !== undefined && (!Array.isArray(entry.covers) || entry.covers.length > 100)) throw new Error("Invalid command coverage.");
      return { command, workingDirectory: relativeScope(entry.workingDirectory, "command workingDirectory"), kind: entry.kind, stage: entry.stage, effects: [...new Set(entry.effects)], covers: (entry.covers || []).map((scope) => relativeScope(scope, "command coverage")), confirmed: true };
    });
  }
  return result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireKnownValue(guide, field, value) {
  if (value === undefined) return;
  if (typeof value !== "string" || !GUIDE_POLICY_CATALOG[guide].fields[field].includes(value)) {
    throw new Error(`Invalid ${guide}.${field} guide policy value.`);
  }
}

export function listGuidePolicies({ locale = "en" } = {}) {
  if (!["en", "ko"].includes(locale)) throw new Error("locale must be en or ko.");
  return Object.entries(GUIDE_POLICY_CATALOG).map(([key, definition]) => ({
    key,
    title: locale === "ko" ? definition.titleKo : definition.titleEn,
    fields: clone(definition.fields),
    ...(key === "agents" ? { structuredFields: {
      projectContext: "Optional user-confirmed purpose/context, at most 1200 characters.",
      rules: "Up to 20 objects: scope (relative path), invariant, safeAlternative.",
      reviewedCommands: "Up to 20 user-confirmed objects: command, workingDirectory (relative path), kind (test/lint/typecheck/build/verification/generation/setup), stage (verification/setup/generation), effects, optional covers (relative project directories), confirmed: true. Effects: read-only, unknown, writes-files, network, live-system, persistent, publishes, device. Commands are not executed by the planner."
    } } : {}),
    profiles: Object.entries(definition.profiles).map(([id, profile]) => ({
      id,
      label: locale === "ko" ? profile.labelKo : profile.labelEn,
      recommended: id === Object.keys(definition.profiles)[0],
      defaults: clone(profile.defaults)
    }))
  }));
}

export function normalizeGuideDecisions(value, { allowPullRequest = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};

  for (const [guide, rawDecision] of Object.entries(value)) {
    if (!Object.hasOwn(GUIDE_POLICY_CATALOG, guide)) throw new Error(`Unknown workspace guide: ${guide}.`);
    if (guide === "pullRequest" && !allowPullRequest) {
      throw new Error("pullRequest guide decisions require collaborationHost: github.");
    }
    if (!rawDecision || typeof rawDecision !== "object" || Array.isArray(rawDecision)) {
      throw new Error(`${guide} guide decision must be an object.`);
    }

    const definition = GUIDE_POLICY_CATALOG[guide];
    const permitted = new Set(["profile", "comment", ...Object.keys(definition.fields), ...(guide === "agents" ? ["projectContext", "rules", "reviewedCommands"] : [])]);
    for (const key of Object.keys(rawDecision)) {
      if (!permitted.has(key)) throw new Error(`Unknown ${guide} guide decision field: ${key}.`);
    }

    const profileId = rawDecision.profile;
    if (typeof profileId !== "string" || !Object.hasOwn(definition.profiles, profileId)) {
      throw new Error(`Invalid ${guide}.profile guide policy value.`);
    }

    const normalized = { profile: profileId, ...clone(definition.profiles[profileId].defaults) };
    for (const field of Object.keys(definition.fields)) {
      requireKnownValue(guide, field, rawDecision[field]);
      if (rawDecision[field] !== undefined) normalized[field] = rawDecision[field];
    }
    if (rawDecision.comment !== undefined) {
      if (typeof rawDecision.comment !== "string" || rawDecision.comment.trim().length > MAX_COMMENT_LENGTH) {
        throw new Error(`${guide}.comment must be a string with at most ${MAX_COMMENT_LENGTH} characters.`);
      }
      normalized.comment = rawDecision.comment.trim();
    }
    if (guide === "agents") Object.assign(normalized, normalizeAgentsExtensions(rawDecision));
    const needsComment = profileId === "custom" || Object.keys(definition.fields).some((field) => normalized[field] === "custom");
    if (needsComment && !normalized.comment) {
      throw new Error(`${guide}.comment is required when profile is custom.`);
    }
    result[guide] = normalized;
  }

  return result;
}
