/* Deterministic Attribute Resolution — the doctrine requires State, Industry,
   Activity, Asset, Land, Role to be resolved BEFORE any model turn. The model
   never sees the raw description; it only ever operates inside the graph this
   resolution produces. Resolution is pure: same description → same graph.

   Alignment rules (revised 2026-08-16):
   · Personal-context language ("at-home mother", "I am", "my store") resolves
     to FOOTPRINT even when the person runs a business — the individual is the
     subject. Only an explicit legal entity suffix (LLC/Inc/Corp/Ltd) forces a
     BOUNDARY over personal context.
   · Unmentioned jurisdiction falls back to the workspace default (TX), never
     a hash roll.
   · Names are synthesized semantically (Role · Industry) — never the raw
     sentence slug. */

export function hash53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unnamed-graph";
}

/* Actor identifiers inside IGL programs cannot contain spaces. */
export function actorToken(name) {
  return name.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Actor";
}

const INDUSTRY_RULES = [
  { value: "oil-and-gas", label: "Oil & Gas", pattern: /oil|\bgas\b|petroleum|drilling|upstream|midstream|downstream|\bwell|\bwells\b|lease|pipeline|refin|\brrc\b|royalt|mineral rights/i,
    commodities: ["Oil", "Gas", "NGL"], agency: "TX-RRC" },
  { value: "retail-ecommerce", label: "Retail & E-Commerce", pattern: /e-?commerce|\bstore|\bshop|retail|boutique|luxury|merch|shopify|etsy|storefront|selling|\bsell\b|products/i,
    commodities: null, agency: "FTC" },
  { value: "education", pattern: /education|university|college|school|student|academic|campus|\bbsn\b|\bmba\b|curriculum/i,
    commodities: null, agency: null, label: "Education" },
  { value: "healthcare", pattern: /health|clinic|hospital|medical|nurs|patient|physician|\bslp\b|dental|therap/i,
    commodities: null, agency: null, label: "Healthcare" },
  { value: "financial-services", label: "Financial Services", pattern: /bank|financ|lending|credit|invest|insur|capital|accounting|\bcpa\b|wealth/i,
    commodities: null, agency: null },
  { value: "construction", pattern: /construct|contractor|infrastructure|concrete|roofing|remodel/i,
    commodities: null, agency: null, label: "Construction" },
  { value: "manufacturing", pattern: /manufactur|factory|industrial|assembly|machining/i,
    commodities: null, agency: null, label: "Manufacturing" },
  { value: "government", pattern: /government|municipal|county|state agency|public sector|ordinance/i,
    commodities: null, agency: null, label: "Government" },
  { value: "technology", label: "Technology", pattern: /tech|software|data|cyber|forensic|incident response|dfir|security|digital|\bsaas\b|\bapp\b|\bai\b|cloud/i,
    commodities: null, agency: null },
];

/* Kind precedence: explicit legal entity suffix > personal context > generic
   company vocabulary > individual vocabulary > default. */
const ENTITY_SUFFIX = /\b(llc|inc|corp|corporation|ltd|llp|plc)\b/i;
const PERSON_PATTERN = /\bi am\b|\bi'm\b|my name is|\bmother\b|\bfather\b|\bmom\b|\bdad\b|\bparent\b|at[- ]home|stay[- ]at[- ]home|caregiver|childcare|freelance|freelancer|\bsolo\b|veteran|retired|myself|\bindividual\b|\bperson\b|landowner|\bmy (store|shop|business|practice|clinic|firm)\b/i;
const COMPANY_PATTERN = /company|operator|producer|enterprise|organization|\bfirm\b|\bgroup\b|holdings|partners|university|hospital|\bbank\b|association|\bagency\b|startup|\bwe (are|operate|run)\b/i;
const INDIVIDUAL_PATTERN = /coordinator|engineer|analyst|student|clinician|technician|foreman|officer|director|manager|specialist|consultant|nurse|teacher|developer|\bowner\b/i;

const STATE_NAMES = {
  texas: "TX", louisiana: "LA", oklahoma: "OK", "new mexico": "NM", california: "CA",
  "new york": "NY", florida: "FL", illinois: "IL", pennsylvania: "PA", ohio: "OH",
  georgia: "GA", "north carolina": "NC", michigan: "MI", "new jersey": "NJ",
  virginia: "VA", washington: "WA", arizona: "AZ", massachusetts: "MA",
  colorado: "CO", tennessee: "TN",
};
const STATE_CODES = new Set(Object.values(STATE_NAMES));

/* Workspace default jurisdiction when the description names none. */
const DEFAULT_JURISDICTION = "TX";

const ACTIVITY_RULES = [
  [/sell|e-?commerce|\bstore\b|\bshop\b|retail|merch|orders|customers/i, "commerce"],
  [/production|produc|pumping|extraction/i, "production"],
  [/drill|spud|workover|completion/i, "drilling"],
  [/forensic|incident|dfir|triage/i, "incident-response"],
  [/instruction|teach|educat|study|enrolled/i, "instruction"],
  [/report|compliance|filing|disclosure/i, "reporting"],
  [/lend|loan|mortgage|underwrit/i, "lending"],
  [/develop|software|programm|\bcoding\b|\bsaas\b|\bapps?\b/i, "development"],
  [/build|construct|remodel|renovat/i, "building"],
  [/process|refin|treat/i, "processing"],
  [/govern|board|oversight|audit/i, "governance"],
  [/care|caregiv|childcare|\bkids\b|children/i, "care"],
  [/design|\bux\b|\bui\b/i, "design"],
  [/analy|research|evaluat/i, "analysis"],
  [/operat|\bruns?\b|manage|\bowns?\b/i, "operations"],
];

const ASSET_RULES = [
  [/store|shop|boutique|e-?commerce/i, "storefront"],
  [/well/i, "well"], [/lease/i, "lease"], [/rig/i, "rig"],
  [/campus/i, "campus"], [/program|degree|\bbsn\b|\bmba\b/i, "program"],
  [/curriculum|course|syllabus/i, "curriculum"],
  [/portfolio|holdings|investments/i, "portfolio"],
  [/facility|plant|clinic|hospital/i, "facility"], [/fleet|trucks|vehicles/i, "fleet"],
  [/pipeline/i, "pipeline"], [/platform|\bsaas\b|\bapp\b/i, "platform"],
  [/data|forensic|system/i, "dataset"], [/practice|caseload|clients/i, "practice"],
];

const LAND_RULES = [
  [/mineral/i, "mineral"], [/fee\b/i, "fee"], [/federal/i, "federal"], [/tribal/i, "tribal"],
  [/offshore|\bocs\b/i, "offshore"], [/state land|public/i, "public"], [/private|home|homestead|residential/i, "private"], [/state/i, "state"],
];

const COMPANY_ROLE_RULES = [
  [/retail|store|shop|e-?commerce|boutique|\bbrand\b/i, "retailer"],
  [/operator/i, "operator"], [/produc/i, "producer"], [/university|college|school/i, "institution"],
  [/lend|bank/i, "lender"], [/contractor/i, "contractor"], [/manufactur/i, "manufacturer"],
  [/agenc/i, "agency"], [/hospital|clinic|health/i, "provider"],
];
const INDIVIDUAL_ROLE_RULES = [
  [/mother|father|\bmom\b|\bdad\b|parent|at[- ]home|caregiver|childcare/i, "caregiver"],
  [/founder|founded|started|my (business|store|shop|company)/i, "founder"],
  [/landowner|\bowner\b|\bowns?\b/i, "owner"],
  [/forensic|dfir|incident/i, "dfir-coordinator"],
  [/nurs|\brn\b/i, "nurse"],
  [/clinic|physician|\bslp\b|therap/i, "clinician"],
  [/student|studying|enrolled/i, "student"],
  [/teacher|educator/i, "teacher"],
  [/engineer/i, "engineer"], [/analyst/i, "analyst"], [/foreman/i, "foreman"],
  [/technician/i, "technician"], [/officer|official/i, "official"], [/develop/i, "developer"],
  [/consult/i, "consultant"],
];

/* Granted action vocabularies per individual role — the footprint's authority
   layer. Actions outside the granted set are what the refusal demonstrates. */
export const ROLE_ACTIONS = {
  "dfir-coordinator": {
    granted: ["triage-alert", "acquire-disk-image", "preserve-evidence", "draft-incident-report"],
    observedGoverning: "capture-volatile-memory",
    observedProposed: "restore-production-systems",
  },
  engineer: {
    granted: ["review-schematics", "sign-field-memo", "approve-workover", "log-inspection"],
    observedGoverning: "authorize-shutdown",
    observedProposed: "modify-pressure-rating",
  },
  clinician: {
    granted: ["review-chart", "order-lab", "document-visit", "sign-discharge"],
    observedGoverning: "prescribe-controlled-substance",
    observedProposed: "alter-billing-code",
  },
  student: {
    granted: ["submit-assignment", "attend-clinical-rotation", "log-practicum-hours", "request-advising"],
    observedGoverning: "grade-peer-work",
    observedProposed: "access-faculty-records",
  },
  nurse: {
    granted: ["administer-medication", "document-vitals", "update-care-plan", "log-shift-notes"],
    observedGoverning: "prescribe-medication",
    observedProposed: "alter-physician-orders",
  },
  teacher: {
    granted: ["post-assignment", "grade-coursework", "log-attendance", "message-guardians"],
    observedGoverning: "change-final-transcript",
    observedProposed: "access-district-payroll",
  },
  founder: {
    granted: ["update-listing", "fulfill-order", "issue-refund", "view-store-analytics"],
    observedGoverning: "change-business-bank-account",
    observedProposed: "alter-tax-nexus",
  },
  owner: {
    granted: ["update-listing", "fulfill-order", "review-lease-terms", "view-store-analytics"],
    observedGoverning: "change-business-bank-account",
    observedProposed: "assign-mineral-rights",
  },
  caregiver: {
    granted: ["schedule-care-activity", "approve-household-purchase", "list-product", "message-buyer"],
    observedGoverning: "sign-medical-consent",
    observedProposed: "alter-dependent-records",
  },
  consultant: {
    granted: ["read-briefing", "draft-deliverable", "submit-invoice", "log-engagement"],
    observedGoverning: "sign-client-attestation",
    observedProposed: "access-client-credentials",
  },
  _default: {
    granted: ["read-briefing", "draft-report", "submit-request", "log-activity"],
    observedGoverning: "approve-exception",
    observedProposed: "modify-controls",
  },
};

function extractName(text, isCompany, industryLabel, role) {
  // "called X" / "named X" patterns win; explicit "X, LLC" entity names next;
  // otherwise everything before the "is a / are the …" descriptor clause.
  const named = text.match(/(?:called|named|name is)\s+((?:[A-Z][A-Za-z0-9.&'-]*)(?:\s+[A-Z][A-Za-z0-9.&'-]*){0,5})/);
  if (named) return named[1].trim();
  if (isCompany) {
    const entity = text.match(/([A-Z][A-Za-z&']+(?:\s+[A-Za-z&']+){0,4}\s+(?:LLC|Inc|Corp(?:oration)?|Ltd|Group|Holdings|Partners))\b/);
    if (entity) return entity[1].trim();
    const clause = text.split(/\s+(?:is|are)\s+(?:a|an|the)\s+/i)[0].split(/[.;\n]/)[0].trim();
    if (/^[A-Z]/.test(clause) && clause.length >= 3 && clause.length <= 48 && !/^(we|i|the|a|an)\b/i.test(clause)) {
      return clause;
    }
    return `${industryLabel} Company`;
  }
  // Individuals get a semantic label, never the raw sentence.
  return `${toTitle(role)} · ${industryLabel}`;
}

function toTitle(s) {
  return s.split(/[-\s]+/).map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

function resolveState(text) {
  const normalized = ` ${String(text).toLowerCase().replace(/[^a-z]+/g, " ")} `;
  for (const [name, code] of Object.entries(STATE_NAMES))
    if (normalized.includes(` ${name} `)) return code;
  const code = String(text).match(/\b([A-Z]{2})\b/i);
  const abbr = code?.[1]?.toUpperCase();
  if (abbr && STATE_CODES.has(abbr)) return abbr;
  return DEFAULT_JURISDICTION;
}

function firstMatch(rules, text) {
  for (const [pattern, value] of rules) if (pattern.test(text)) return value;
  return null;
}

export function resolveDescription(description, { kind = null, auto = false } = {}) {
  const text = (description || "").trim();
  const h = hash53(auto ? `auto-${Date.now()}` : text || "empty");

  const isCompany = kind
    ? kind === "BOUNDARY"
    : auto
      ? h % 2 === 0
      : ENTITY_SUFFIX.test(text)
        ? true
        : PERSON_PATTERN.test(text)
          ? false
          : COMPANY_PATTERN.test(text)
            ? true
            : INDIVIDUAL_PATTERN.test(text)
              ? false
              : true;
  const graphKind = isCompany ? "BOUNDARY" : "FOOTPRINT";

  const industryRule = INDUSTRY_RULES.find((r) => r.pattern.test(text))
    ?? INDUSTRY_RULES[h % INDUSTRY_RULES.length];
  const industry = industryRule.value;

  const role = isCompany
    ? firstMatch(COMPANY_ROLE_RULES, text) ?? (industry === "retail-ecommerce" ? "retailer" : "operator")
    : firstMatch(INDIVIDUAL_ROLE_RULES, text) ?? "analyst";

  const name = auto
    ? isCompany ? `Provisioned Company ${String(h % 997).padStart(3, "0")}` : `Provisioned Individual ${String(h % 997).padStart(3, "0")}`
    : extractName(text, isCompany, industryRule.label ?? "Technology", role);

  const now = new Date();
  const period = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;

  return {
    name,
    kind: graphKind,
    actor: actorToken(name),
    description: auto ? "Auto-provisioned from the studio console." : text,
    attributes: {
      state: resolveState(text),
      industry,
      activity: firstMatch(ACTIVITY_RULES, text) ?? (isCompany ? "operations" : "analysis"),
      asset: firstMatch(ASSET_RULES, text) ?? (industry === "retail-ecommerce" ? "storefront" : isCompany ? "facility" : "dataset"),
      land: firstMatch(LAND_RULES, text) ?? (isCompany ? "fee" : "private"),
      role,
    },
    industryDetail: {
      commodities: industryRule.commodities,
      agency: industryRule.agency,
    },
    period,
    roleActions: isCompany ? null : (ROLE_ACTIONS[role] ?? ROLE_ACTIONS._default),
  };
}
