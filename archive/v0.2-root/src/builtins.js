// SPDX-License-Identifier: Apache-2.0
/* Declared signatures for the governed subsystem surface.
   A governed language cannot have an open function namespace: if the checker
   cannot see a call's shape, it cannot reject a malformed one before the model
   is paid for. See docs/CRITIQUE.md §A1. */

/* type ::= "code" | "string" | "number" | "symbol" | "list" | "ref" | "any" */
const sig = (params, opts = {}) => ({ params, ...opts });
const req = (name, type) => ({ name, type, required: true });
const optl = (name, type, def) => ({ name, type, required: false, default: def });

export const BUILTINS = {
  /* ---- UDM: deterministic. Resolves governed structure; never infers. ---- */
  "UDM.Resolve": sig([
    req("AgencyCode", "code"),
    optl("RequiredForms", "list"),
    optl("Period", "code"),
  ], { deterministic: true, produces: "resolution" }),

  "UDM.Validate": sig([
    req("Target", "any"),
    optl("Ruleset", "symbol"),
  ], { deterministic: true, produces: "validation" }),

  "UDM.Enforce": sig([
    req("Constraint", "symbol"),
    optl("Target", "any"),
  ], { deterministic: true, produces: "enforcement" }),

  "UDM.CrossCheck": sig([
    req("Left", "any"),
    req("Right", "any"),
    optl("Tolerance", "number", 0),
  ], { deterministic: true, produces: "crosscheck" }),

  "UDM.Align": sig([
    req("Source", "any"),
    req("Ontology", "symbol"),
  ], { deterministic: true, produces: "alignment" }),

  /* ---- AI: probabilistic. Model identity is mandatory (CRITIQUE B3). ---- */
  "AI.Infer": sig([
    req("Task", "symbol"),
    req("Model", "code"),
    optl("Inputs", "list"),
    optl("Temperature", "number", 0),
    optl("Seed", "number"),
    optl("MinConfidence", "number", 0.6),
  ], { deterministic: false, produces: "inference", requiresModel: true }),

  "AI.Validate": sig([
    req("Target", "any"),
    req("Model", "code"),
    optl("Against", "list"),
  ], { deterministic: false, produces: "inference", requiresModel: true }),

  /* Governed extraction. Runs through the UDM↔AI bridge: the admissible set
     constrains generation, the output is projected back onto it, and any
     quantity is read from source rather than generated. This is the only
     call that may put a number into an output. */
  "AI.Extract": sig([
    req("Slots", "list"),
    req("Model", "code"),
    optl("Source", "any"),
    optl("Strictness", "symbol"),
    optl("Seed", "number"),
  ], { deterministic: false, produces: "extraction", requiresModel: true, bridged: true }),

  /* ---- IOS: orchestration and trace. ---- */
  "IOS.Trace": sig([
    req("Channels", "list"),
    optl("Label", "string"),
  ], { deterministic: true, produces: "trace" }),

  "IOS.Attest": sig([
    req("Signer", "any"),
    req("Role", "symbol"),
    optl("Note", "string"),
  ], { deterministic: true, produces: "attestation" }),

  "IOS.Stage": sig([
    req("Artifact", "any"),
  ], { deterministic: true, produces: "staged" }),
};

/* Slot registry — the governed surface AI.Extract may fill.
   `admissible` may be a literal set or a resolver over the live boundary, so a
   scope-dependent set (which forms exist at this agency, this period) is
   computed by UDM rather than hardcoded. `kind: "span"` means the value is
   read from source; a quantity may never be declared any other way. */
export const SLOTS = {
  form:          { kind: "code", admissibleFrom: ({ udm, boundary }) => (udm.forms?.[boundary.AgencyCode]?.forms) || [] },
  jurisdiction:  { kind: "code", dimension: "Jurisdiction",
                   admissibleFrom: ({ udm }) => udm.boundaries?.Jurisdiction?.values || [] },
  commodity:     { kind: "code", dimension: "Commodity",
                   admissibleFrom: ({ udm }) => udm.boundaries?.Commodity?.values || [] },
  diagnosis:     { kind: "enum", admissible: ["mesothelioma", "asbestosis", "silicosis", "pleural thickening",
                                              "pleural plaques", "lung cancer / carcinoma", "COPD / emphysema",
                                              "pulmonary fibrosis", "pneumoconiosis", "leukemia", "lymphoma"] },
  total_charges: { kind: "span", parse: "currency" },
  lien_amount:   { kind: "span", parse: "currency" },
  date_of_service: { kind: "span", parse: "date" },
  exposure_start:  { kind: "span", parse: "date" },
  employer:      { kind: "span", parse: "raw" },
  job_site:      { kind: "span", parse: "raw" },
};

/* Trace channels the runtime knows how to capture. */
export const TRACE_CHANNELS = new Set(["Reasoning", "Tools", "Code", "Search", "Context"]);

/* Intent registry. An intent is authorised per actor role and boundary, declares
   the outputs it is allowed to produce, and may require human attestation. */
export const INTENTS = {
  Generate_Compliance_Packet: {
    roles: ["Operator", "Compliance", "Counsel"],
    requiresBoundary: ["Jurisdiction", "Period"],
    outputs: { Compliance_Packet: "artifact", TurnTrace_ID: "code" },
    requiresAttestation: false,
    params: { Mode: ["Full", "Delta", "DryRun"] },
  },
  File_Production_Report: {
    roles: ["Operator", "Compliance"],
    requiresBoundary: ["Jurisdiction", "Period", "Commodity"],
    outputs: { Filed_Report: "artifact", TurnTrace_ID: "code" },
    requiresAttestation: true,          // nothing files without a human (CRITIQUE B5)
    params: { Mode: ["Full", "Amendment"] },
  },
  Classify_Discovery_Corpus: {
    roles: ["Counsel", "Paralegal", "Operator"],
    requiresBoundary: ["Matter"],
    outputs: { Evidentiary_Index: "artifact", TurnTrace_ID: "code" },
    requiresAttestation: false,
    params: { Scheme: ["Produced", "Custodian", "Chronological", "DocType", "Issue", "Hybrid"] },
  },
  Assess_Production_Integrity: {
    roles: ["Counsel", "Paralegal"],
    requiresBoundary: ["Matter"],
    outputs: { Integrity_Report: "artifact", TurnTrace_ID: "code" },
    requiresAttestation: false,
    params: {},
  },
  Compile_Findings: {
    roles: ["Counsel"],
    requiresBoundary: ["Matter"],
    outputs: { Findings_Memo: "artifact", TurnTrace_ID: "code" },
    requiresAttestation: true,          // analytical recommendations carry a name
    params: {},
  },
  Produce_Privilege_Log: {
    roles: ["Counsel"],
    requiresBoundary: ["Matter"],
    outputs: { Privilege_Log: "artifact", TurnTrace_ID: "code" },
    requiresAttestation: true,
    params: {},
  },
};
