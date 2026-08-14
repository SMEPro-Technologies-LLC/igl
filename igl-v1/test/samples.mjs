import { run, verify, recomputeFuse } from "../src/index.js";

const C1 = `
IGL v1.0 PROGRAM "simple_query_example" ;
IDENTITY {
  DECLARE IDENTITY agent AS IDENTITY_OPERAND {
    id : "igl://identity/houston/agent-001", authority : 0.5,
    boundary : public_boundary, propagation : INHERIT } ;
}
CONSTRAINTS {
  DECLARE BOUNDARY public_boundary AS BOUNDARY_TENSOR {
    dimensions : 2, shape : [512, 128],
    jurisdiction: "udm://jurisdiction/public-domain", strictness : HARD } ;
  DECLARE CONSTRAINT public_constraint AS CONSTRAINT_MATRIX {
    source : "udm://module/public-domain-v2", version : "2.0.1", digest : "a3f9c1..." } ;
}
BEGIN
  INJECT ( public_constraint, inference_ctx ) ;
  LET ai_output    = AI_INFER("What is the capital of Texas?") ;
  LET governed_out = FUSE ( ai_output, public_constraint ) ;
  LET trace        = CAPTURE_TRACE ( governed_out ) INTO trace_01 ;
  LET turn         = BIND ( agent, trace_01 ) AS turn_01 ;
END
RECEIPT { CAPTURE ( turn_01 ) AS final_receipt WITH_OUTCOME COMPLIANT ; }
`;

const C2 = `
IGL v1.0 PROGRAM "multi_identity_authority_escalation" ;
IDENTITY {
  DECLARE IDENTITY base_agent AS IDENTITY_OPERAND {
    id : "igl://identity/ops/agent-base-007", authority : 0.3,
    boundary : standard_boundary,
    propagation : DELEGATE TO "igl://identity/ops/supervisor-001" } ;
  DECLARE IDENTITY supervisor AS IDENTITY_OPERAND {
    id : "igl://identity/ops/supervisor-001", authority : 0.85,
    boundary : elevated_boundary,
    exceptions : ["igl://exception/restricted-domain-access"], propagation : INHERIT } ;
}
CONSTRAINTS {
  DECLARE BOUNDARY standard_boundary AS BOUNDARY_TENSOR {
    dimensions : 2, shape : [256, 64], jurisdiction: "udm://jurisdiction/standard", strictness : HARD } ;
  DECLARE BOUNDARY elevated_boundary AS BOUNDARY_TENSOR {
    dimensions : 3, shape : [512, 256, 128], jurisdiction: "udm://jurisdiction/elevated", strictness : HARD } ;
  DECLARE CONSTRAINT standard_constraint AS CONSTRAINT_MATRIX {
    source : "udm://module/standard-v3", version : "3.1.0", digest : "b72d40..." } ;
  DECLARE CONSTRAINT elevated_constraint AS CONSTRAINT_MATRIX {
    source : "udm://module/elevated-v1", version : "1.0.0", digest : "e19a88..." } ;
}
BEGIN
  INJECT ( standard_constraint, inference_ctx ) ;
  LET base_output = AI_INFER("Retrieve restricted operational data") ;
  IF_AUTHORITY ( base_agent, LT, 0.5 ) THEN {
    LET escalated_id    = PROJECT( "igl://identity-graph/ops", "udm://jurisdiction/elevated" ) ;
    INJECT ( elevated_constraint, inference_ctx2 ) ;
    LET elevated_output = FUSE ( base_output, elevated_constraint ) UNDER supervisor ;
    LET trace           = CAPTURE_TRACE ( elevated_output ) INTO trace_escalated ;
    LET turn            = BIND ( supervisor, trace_escalated ) AS turn_escalated ;
  } ELSE {
    LET governed_out = FUSE ( base_output, standard_constraint ) ;
    LET trace        = CAPTURE_TRACE ( governed_out ) INTO trace_base ;
    LET turn         = BIND ( base_agent, trace_base ) AS turn_escalated ;
  }
END
RECEIPT { CAPTURE ( turn_escalated ) AS final_receipt ; }
`;

const C3 = `
IGL v1.0 PROGRAM "recursive_governed_reasoning" ;
IDENTITY {
  DECLARE IDENTITY reasoner AS IDENTITY_OPERAND {
    id : "igl://identity/reasoning/loop-agent-001", authority : 0.6,
    boundary : reasoning_boundary, propagation : INHERIT } ;
}
CONSTRAINTS {
  DECLARE BOUNDARY reasoning_boundary AS BOUNDARY_TENSOR {
    dimensions : 4, shape : [256, 128, 64, 32], jurisdiction: "udm://jurisdiction/reasoning-domain", strictness : SOFT } ;
  DECLARE CONSTRAINT reasoning_constraint AS CONSTRAINT_MATRIX {
    source : "udm://module/reasoning-v2", version : "2.3.0", digest : "c88f12..." } ;
}
BEGIN
  INJECT ( reasoning_constraint, inference_ctx ) ;
  LET initial_output = FUSE ( AI_INFER("Analyze the governance implications of recursive AI reasoning"), reasoning_constraint ) ;
  RECURSE ( initial_output, inference_ctx ) MAX_DEPTH 3 CARRYING reasoner AS recursive_chain ;
  LET final_trace = CAPTURE_TRACE ( recursive_chain ) INTO final_trace_01 ;
  LET final_turn  = BIND ( reasoner, final_trace_01 ) AS final_turn_01 ;
END
RECEIPT { CAPTURE ( final_turn_01 ) AS final_receipt ; }
`;

const C5 = `
IGL v1.0 PROGRAM "full_turntrace_receipt_demo" ;
IDENTITY {
  DECLARE IDENTITY audited_agent AS IDENTITY_OPERAND {
    id : "igl://identity/audit/agent-full-001", authority : 0.9,
    boundary : full_audit_boundary, exceptions : [], propagation : INHERIT } ;
}
CONSTRAINTS {
  DECLARE BOUNDARY full_audit_boundary AS BOUNDARY_TENSOR {
    dimensions : 4, shape : [1024, 512, 256, 128], jurisdiction: "udm://jurisdiction/full-audit-zone",
    temporal : ["2026-08-01T00:00:00Z", "2026-08-31T23:59:59Z"], strictness : HARD } ;
  DECLARE CONSTRAINT audit_constraint AS CONSTRAINT_MATRIX {
    source : "udm://module/full-audit-v1", version : "1.0.0", digest : "9a3b77..." } ;
}
BEGIN
  INJECT ( audit_constraint, inference_ctx ) ;
  LET output_01 = FUSE ( AI_INFER("Summarize all governed AI interactions for audit period August 2026"), audit_constraint ) ;
  LET trace_01  = CAPTURE_TRACE ( output_01 ) INTO cognitive_trace_01 ;
  LET turn_01   = BIND ( audited_agent, cognitive_trace_01 ) AS turn_record_01 ;
  LET output_02 = FUSE ( AI_INFER("Identify anomalous authority escalations in the audit period"), audit_constraint ) ;
  LET trace_02  = CAPTURE_TRACE ( output_02 ) INTO cognitive_trace_02 ;
  LET turn_02   = BIND ( audited_agent, cognitive_trace_02 ) AS turn_record_02 ;
  LET prior_receipt = CAPTURE ( turn_record_01 ) AS interim_receipt ;
  LET is_valid      = VERIFY ( interim_receipt, audited_agent ) ;
  IF_AUTHORITY ( audited_agent, GTE, 0.8 ) THEN {
    LET output_03  = FUSE ( AI_INFER("Generate final audit summary report"), audit_constraint ) ;
    LET trace_03   = CAPTURE_TRACE ( output_03 ) INTO cognitive_trace_03 ;
    LET final_turn = BIND ( audited_agent, cognitive_trace_03 ) AS turn_record_final ;
  } ELSE {
    LET final_turn = turn_record_02 ;
  }
END
RECEIPT { CAPTURE ( turn_record_final ) AS session_receipt WITH_OUTCOME COMPLIANT ; }
`;

const C4 = `
IGL v1.0 PROGRAM "cross_jurisdiction_enforcement" SESSION "a1b2c3d4-e5f6-7890-abcd-ef1234567890" ;
IDENTITY {
  DECLARE IDENTITY global_agent AS IDENTITY_OPERAND {
    id : "igl://identity/global/cross-border-001", authority : 0.75,
    boundary : multi_jurisdiction_boundary,
    exceptions : [ "igl://exception/eu-gdpr-article9-override", "igl://exception/us-hipaa-deidentified-data" ],
    propagation : ISOLATE } ;
}
CONSTRAINTS {
  DECLARE BOUNDARY eu_boundary AS BOUNDARY_TENSOR {
    dimensions : 3, shape : [512, 256, 128], jurisdiction: "udm://jurisdiction/eu/gdpr",
    temporal : ["2026-01-01T00:00:00Z", "2026-12-31T23:59:59Z"], strictness : HARD } ;
  DECLARE BOUNDARY us_boundary AS BOUNDARY_TENSOR {
    dimensions : 2, shape : [512, 128], jurisdiction: "udm://jurisdiction/us/hipaa",
    temporal : ["2026-01-01T00:00:00Z", "2026-12-31T23:59:59Z"], strictness : HARD } ;
  DECLARE BOUNDARY multi_jurisdiction_boundary AS BOUNDARY_TENSOR {
    dimensions : 5, shape : [512, 256, 128, 64, 32], jurisdiction: "udm://jurisdiction/composite/eu-us", strictness : HARD } ;
  DECLARE CONSTRAINT eu_constraint AS CONSTRAINT_MATRIX {
    source : "udm://module/gdpr-v4", version : "4.0.0", digest : "d91c03..." } ;
  DECLARE CONSTRAINT us_constraint AS CONSTRAINT_MATRIX {
    source : "udm://module/hipaa-v2", version : "2.1.0", digest : "f44e55..." } ;
}
BEGIN
  INJECT ( eu_constraint, inference_ctx ) ;
  LET eu_governed = FUSE ( AI_INFER("Analyze patient treatment outcomes across EU and US facilities"), eu_constraint ) ;
  WHEN_BOUNDARY ( eu_boundary, eu_constraint ) WITHIN {
    INJECT ( us_constraint, inference_ctx_us ) ;
    LET cross_governed = FUSE ( eu_governed, us_constraint ) ;
    LET trace          = CAPTURE_TRACE ( cross_governed ) INTO cross_trace ;
    LET turn           = BIND ( global_agent, cross_trace ) AS cross_turn ;
  } OUTSIDE {
    UNLESS_EXCEPTION ( "igl://exception/eu-gdpr-article9-override", global_agent ) {
      LET fallback_output = FUSE ( AI_INFER("Provide de-identified population statistics only"), eu_constraint ) ;
      LET trace = CAPTURE_TRACE ( fallback_output ) INTO fallback_trace ;
      LET turn  = BIND ( global_agent, fallback_trace ) AS cross_turn ;
    }
  }
END
RECEIPT { CAPTURE ( cross_turn ) AS final_receipt ; }
`;

const samples = { C1, C2, C3, C4, C5 };
let pass = 0, fail = 0;
for (const [name, src] of Object.entries(samples)) {
  try {
    const r = run(src, { seed: 7, offline: true });   // Schedule C conformance: language semantics, explicit offline mode
    const v = verify(r.receipt);
    // recompute the FUSE of the first sealed trace we can find
    const firstTrace = r.traces.find(t => t.trace.fuse);
    const fc = firstTrace ? recomputeFuse(firstTrace.trace.fuse) : { ok: null };
    const ok = v.ok && (fc.ok === null || fc.ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  outcome=${r.receipt.outcome}  verify=${v.ok}  fuseRecompute=${fc.ok}  seq=${r.receipt.turnSequenceNo}`);
    ok ? pass++ : fail++;
  } catch (e) {
    console.log(`FAIL  ${name}  ERROR ${e.code || ""} ${e.message}`);
    if (e.errors) e.errors.forEach(x => console.log("      -", x.toString?.() || x.message));
    fail++;
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
