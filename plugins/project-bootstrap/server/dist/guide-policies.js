export const GUIDE_POLICY_SCHEMA_VERSION = 2;

const policy = (titleEn, titleKo, profiles, fields) => ({ titleEn, titleKo, profiles, fields });

export const GUIDE_POLICY_CATALOG = Object.freeze({
  agents: policy("AGENTS.md", "AGENTS.md", {
    contextual: { labelEn: "Contextual routing", labelKo: "상황별 라우팅", defaults: { routing: "task-relevant", verification: "affected-checks", localScope: "root-only", codingStyle: "existing-patterns", functionDesign: "single-responsibility", commentStyle: "why-and-invariants" } },
    minimal: { labelEn: "Minimal routing", labelKo: "최소 라우팅", defaults: { routing: "essential-only", verification: "affected-checks", localScope: "root-only", codingStyle: "existing-patterns", functionDesign: "single-responsibility", commentStyle: "minimal" } },
    "strict-governance": { labelEn: "Strict governance", labelKo: "엄격한 거버넌스", defaults: { routing: "relevant-guide-and-plan", verification: "full-suite", localScope: "root-only", codingStyle: "modular-boundaries", functionDesign: "separate-effects", commentStyle: "why-and-invariants" } },
    custom: { labelEn: "Custom", labelKo: "사용자 정의", defaults: { routing: "task-relevant", verification: "affected-checks", localScope: "root-only", codingStyle: "existing-patterns", functionDesign: "single-responsibility", commentStyle: "why-and-invariants" } }
  }, {
    routing: ["task-relevant", "essential-only", "relevant-guide-and-plan"],
    verification: ["affected-checks", "full-suite", "custom"],
    localScope: ["root-only", "nested-where-needed"],
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
    const permitted = new Set(["profile", "comment", ...Object.keys(definition.fields)]);
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
    const needsComment = profileId === "custom" || Object.keys(definition.fields).some((field) => normalized[field] === "custom");
    if (needsComment && !normalized.comment) {
      throw new Error(`${guide}.comment is required when profile is custom.`);
    }
    result[guide] = normalized;
  }

  return result;
}
