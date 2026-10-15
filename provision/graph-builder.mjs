/* Graph construction + IGL program generation for provisioned identities.

   The graph IS the computing matrix: grants write the authority layer,
   observations write the descriptive layers (governing/proposed), and the
   orchestration system then GENERATES the .igl program whose decode automata
   are compiled from the granted layer only. One-time boot: grants append only
   when the actor's journal is fresh; an existing journal is replayed, never
   re-seeded. */

import { Interpreter, UDMRuntime, IOSRuntime } from "../src/interpreter.js";
import { Bridge } from "../src/bridge.js";
import { GraphRuntime, DEFAULT_DIMENSIONS } from "../src/graph.js";
import { Signer as TraceSigner } from "../src/sign.js";
import { INTENTS } from "../src/builtins.js";
import { GovernedAI } from "./governed-ai.mjs";

function jurisdictionLattice(stateCode, agencyCode) {
  const parents = { ...DEFAULT_DIMENSIONS.Jurisdiction.parents };
  const stateNode = `US-${stateCode}`;
  if (!(stateNode in parents)) parents[stateNode] = "US";
  if (agencyCode && !(agencyCode in parents)) parents[agencyCode] = stateNode;
  return { type: "lattice", parents };
}

/* ---------------- BOUNDARY (company) ---------------- */

function boundaryProgram({ resolved, grantedJurisdiction, commodities, agencyCode, hasFiling }) {
  const { name, actor, period } = resolved;
  const commodityBoundary = hasFiling ? `, Commodity:${commodities[1] ?? commodities[0]}` : "";
  const slots = hasFiling ? "jurisdiction, commodity" : "jurisdiction";
  const L = [];
  L.push(`%igl 0.2`);
  L.push(``);
  L.push(`# =====================================================================`);
  L.push(`# ${name}: Identity Graph · Company · BOUNDARY`);
  L.push(`#`);
  L.push(`# Generated after the graph fold computed this`);
  L.push(`# actor's granted footprint:`);
  L.push(`#     granted  Jurisdiction { ${grantedJurisdiction.join(", ")} }${hasFiling ? `  Commodity { ${commodities.join(", ")} }` : ""}`);
  L.push(`#`);
  L.push(`# AI.Extract uses the bridge to compile the granted set into a prefix`);
  L.push(`# automaton. At each step, only tokens that continue an allowed value`);
  L.push(`# can be selected.`);
  L.push(`# =====================================================================`);
  L.push(``);
  L.push(``);
  L.push(`# ---------------------------------------------------------------------`);
  L.push(`# 1. Create a compliance packet within the granted footprint.`);
  L.push(`# ---------------------------------------------------------------------`);
  L.push(`ID[${actor}:Operator | Jurisdiction:${grantedJurisdiction[1] ?? grantedJurisdiction[0]}, Period:${period}]`);
  L.push(`  :: Intent[Generate_Compliance_Packet, Mode=Full]`);
  L.push(`  => Context[Traces=None],`);
  L.push(`     Compute[`);
  if (agencyCode) L.push(`       UDM.Resolve(AgencyCode=${agencyCode}, RequiredForms=[PR-202], Period=${period}),`);
  L.push(`       AI.Extract(Slots=[${slots}], Model=distilgpt2-local, Seed=5),`);
  L.push(`       IOS.Trace(Channels=[Reasoning, Context])`);
  L.push(`     ]`);
  L.push(`  -> Output[Compliance_Packet, TurnTrace_ID]`);
  L.push(`  OnFail[Remediate(Notify=compliance_lead)];`);
  if (hasFiling) {
    L.push(``);
    L.push(``);
    L.push(`# ---------------------------------------------------------------------`);
    L.push(`# 2. File the production report at a SPECIALISED boundary. Filing`);
    L.push(`#    requires a registered signer before the report can be released.`);
    L.push(`# ---------------------------------------------------------------------`);
    L.push(`ID[${actor}:Operator | Jurisdiction:${agencyCode}, Period:${period}${commodityBoundary}]`);
    L.push(`  :: Intent[File_Production_Report, Mode=Full]`);
    L.push(`  => Context[Traces=Recent(5)],`);
    L.push(`     Compute[`);
    L.push(`       UDM.Validate(Target=@Compliance_Packet, Ruleset=production_integrity),`);
    L.push(`       IOS.Attest(Signer=SMEPro_Governance_Board, Role=Compliance, Note="Packet reviewed against granted footprint"),`);
    L.push(`       IOS.Trace(Channels=[Reasoning, Context])`);
    L.push(`     ]`);
    L.push(`  -> Output[Filed_Report, TurnTrace_ID]`);
    L.push(`  OnFail[Remediate(Notify=compliance_lead)];`);
  }
  L.push(``);
  return L.join("\n");
}

export function buildBoundaryGraph({ resolved, journal, seeded, tok, models, governedGenerate }) {
  const { actor, attributes, industryDetail, period } = resolved;
  const stateNode = `US-${attributes.state}`;
  const agencyCode = attributes.industry === "oil-and-gas" ? (industryDetail.agency ?? stateNode) : null;
  const commodities = industryDetail.commodities;
  const hasFiling = !!(agencyCode && commodities);

  const dimensions = {
    ...DEFAULT_DIMENSIONS,
    Jurisdiction: jurisdictionLattice(attributes.state, agencyCode),
    AgencyCode: { type: "lattice", parents: agencyCode ? { [agencyCode]: stateNode } : {} },
  };
  const graph = new GraphRuntime({ dimensions, journal });

  const grantedJurisdiction = ["US", stateNode];
  if (seeded) {
    graph.grant(actor,
      {
        Jurisdiction: grantedJurisdiction,
        ...(commodities ? { Commodity: commodities } : {}),
        Period: [period],
      },
      { by: "SMEPro Governance Board", role: "Operator" });
    // Descriptive layers: what the graph has SEEN, distinct from authority.
    graph.observe(actor, { Jurisdiction: [stateNode], ...(commodities ? { Commodity: [commodities[1] ?? commodities[0]] } : {}) }, { cls: "deterministic" });
    for (let i = 0; i < 3; i++) graph.observe(actor, { Jurisdiction: ["US-CA"] }, { cls: "ai" });
  }

  const jurisdictionValues = ["US", stateNode, "US-CA", ...(agencyCode ? [agencyCode] : [])];
  const udm = new UDMRuntime({
    boundaries: {
      Jurisdiction: { values: jurisdictionValues },
      ...(commodities ? { Commodity: { values: ["Hydrocarbon", ...commodities] } } : {}),
      Period: { values: [period, `${nowYear()}-Q${(nowQuarter() % 4) + 1}`] },
    },
    forms: agencyCode === "TX-RRC" ? { "TX-RRC": { forms: ["PR-202", "PR-203"] } } : {},
    constraints: hasFiling ? { production_integrity: [{ name: "packet-produced", test: (t) => !!t && t.produced === true }] } : {},
  });

  const bridge = new Bridge({ dimensions, strictness: "lattice", tokenizer: tok });
  const slots = { jurisdiction: { kind: "code", dimension: "Jurisdiction" } };
  const prompts = { jurisdiction: () => `${resolved.name} files its compliance report with the regulator in jurisdiction` };
  if (commodities) {
    slots.commodity = { kind: "code", dimension: "Commodity" };
    prompts.commodity = () => `The primary commodity ${resolved.name} produces is`;
  }
  const ai = new GovernedAI({ graph, bridge, models, slots, prompts, governedGenerate });

  const attestSigner = TraceSigner.generate("smepro-governance-board");
  const interp = new Interpreter({
    identity: graph, udm, ai, ios: new IOSRuntime({ journal }),
    signers: { SMEPro_Governance_Board: attestSigner },
  });

  const program = boundaryProgram({ resolved, grantedJurisdiction, commodities, agencyCode, hasFiling });
  return { graph, interp, program };
}

function nowYear() { return new Date().getFullYear(); }
function nowQuarter() { return Math.floor(new Date().getMonth() / 3) + 1; }

/* ---------------- FOOTPRINT (individual) ---------------- */

function roleToken(role) {
  return role.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function footprintProgram({ resolved, granted, observedProposed, intentName, roleTok }) {
  const { name, actor } = resolved;
  const L = [];
  L.push(`%igl 0.2`);
  L.push(``);
  L.push(`# =====================================================================`);
  L.push(`# ${name}: Identity Graph · Individual · FOOTPRINT`);
  L.push(`#`);
  L.push(`# Generated after the graph fold computed this`);
  L.push(`# actor's footprint:`);
  L.push(`#     granted  Action { ${granted.join(", ")} }`);
  L.push(`#     observed ${observedProposed} x5 as AI proposals`);
  L.push(`#     proposed observations do not grant authority`);
  L.push(`#`);
  L.push(`# Statement 1 uses a granted action. Statement 2 tries an observed action`);
  L.push(`# that was never granted, so IGL rejects it before calling the model.`);
  L.push(`# =====================================================================`);
  L.push(``);
  L.push(``);
  L.push(`# ---------------------------------------------------------------------`);
  L.push(`# 1. Run a granted action within the footprint.`);
  L.push(`# ---------------------------------------------------------------------`);
  L.push(`ID[${actor}:${roleTok} | Action:${granted[3] ?? granted[0]}]`);
  L.push(`  :: Intent[${intentName}]`);
  L.push(`  => Context[Traces=None],`);
  L.push(`     Compute[`);
  L.push(`       AI.Extract(Slots=[role_action], Model=distilgpt2-local, Seed=9),`);
  L.push(`       IOS.Trace(Channels=[Reasoning, Context])`);
  L.push(`     ]`);
  L.push(`  -> Output[Action_Record, TurnTrace_ID]`);
  L.push(`  OnFail[Remediate(Notify=CISO_Office)];`);
  L.push(``);
  L.push(``);
  L.push(`# ---------------------------------------------------------------------`);
  L.push(`# 2. This observed action was never granted, so IGL rejects it with`);
  L.push(`#    IGL_FOOTPRINT_DENIED.`);
  L.push(`# ---------------------------------------------------------------------`);
  L.push(`ID[${actor}:${roleTok} | Action:${observedProposed}]`);
  L.push(`  :: Intent[${intentName}]`);
  L.push(`  => Context[Traces=None],`);
  L.push(`     Compute[`);
  L.push(`       AI.Extract(Slots=[role_action], Model=distilgpt2-local, Seed=9),`);
  L.push(`       IOS.Trace(Channels=[Reasoning, Context])`);
  L.push(`     ]`);
  L.push(`  -> Output[Action_Record, TurnTrace_ID]`);
  L.push(`  OnFail[Remediate(Notify=CISO_Office)];`);
  L.push(``);
  return L.join("\n");
}

export function buildFootprintGraph({ resolved, journal, seeded, tok, models, governedGenerate }) {
  const { actor, roleActions } = resolved;
  const roleTok = roleToken(resolved.attributes.role);
  const intentName = `Execute_${roleTok}_Action`;
  const dimensions = { ...DEFAULT_DIMENSIONS, Action: { type: "set" } };
  const graph = new GraphRuntime({ dimensions, journal });

  const { granted, observedGoverning, observedProposed } = roleActions;
  if (seeded) {
    graph.grant(actor, { Action: granted }, { by: "Graph Studio Provisioning", role: roleTok });
    for (let i = 0; i < 3; i++) graph.observe(actor, { Action: [observedGoverning] }, { cls: "deterministic" });
    for (let i = 0; i < 5; i++) graph.observe(actor, { Action: [observedProposed] }, { cls: "ai" });
  }

  const udm = new UDMRuntime({
    boundaries: { Action: { values: [...granted, observedGoverning, observedProposed] } },
  });
  const bridge = new Bridge({ dimensions, strictness: "exact", tokenizer: tok });
  const ai = new GovernedAI({
    graph, bridge, models,
    slots: { role_action: { kind: "enum", dimension: "Action" } },
    prompts: { role_action: () => `As ${resolved.attributes.role}, the next action ${resolved.name} is authorised to take is` },
    governedGenerate,
  });
  const intents = {
    ...INTENTS,
    [intentName]: {
      roles: [roleTok],
      requiresBoundary: ["Action"],
      outputs: { Action_Record: "artifact", TurnTrace_ID: "code" },
      requiresAttestation: false,
      params: {},
    },
  };
  const interp = new Interpreter({ identity: graph, udm, ai, ios: new IOSRuntime({ journal }), intents });

  const program = footprintProgram({ resolved, granted, observedProposed, intentName, roleTok });
  return { graph, interp, program };
}
