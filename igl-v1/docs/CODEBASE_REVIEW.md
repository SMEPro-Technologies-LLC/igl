# WellSite on IGL v1.0 — codebase review guide

This document is written for a reviewer who wants to read the WellSite rebuild
and the runtime it executes on, understand the logic end to end, and verify it
without trusting anyone. It walks the program, the execution, the receipt, and
then the runtime file by file. Every claim here can be checked by running the
commands in the last section.

---

## 1. What WellSite is, and what was rebuilt

WellSite is a live oil and gas production filing application. The rebuild takes
its governed decision logic, preparing a Texas Railroad Commission production
packet and then filing the production report, and expresses it as an IGL v1.0
program that runs on a reference runtime and produces a signed, independently
verifiable receipt.

Two things are in scope. The IGL program, which is the governed logic. And the
runtime, which executes it under a fixed order and seals the receipt. The user
interface, storage, and network plumbing of the live app are not IGL and are not
in scope; IGL governs the decision layer.

---

## 2. The WellSite program

The whole governed session is one file, `programs/wellsite.igl`. Read it top to
bottom and the logic is visible.

```
IGL v1.0 PROGRAM "wellsite_production_filing" ;

IDENTITY {
  DECLARE IDENTITY field_operator AS IDENTITY_OPERAND {
    id : "igl://identity/allco/operator-014", authority : 0.4,
    boundary : tx_rrc_boundary,
    propagation : DELEGATE TO "igl://identity/allco/compliance-001" } ;
  DECLARE IDENTITY compliance_officer AS IDENTITY_OPERAND {
    id : "igl://identity/allco/compliance-001", authority : 0.85,
    boundary : tx_rrc_filing_boundary,
    exceptions : [ "igl://exception/tx-rrc-late-filing-window" ],
    propagation : INHERIT } ;
}

CONSTRAINTS {
  DECLARE BOUNDARY tx_rrc_boundary AS BOUNDARY_TENSOR { ... jurisdiction: "udm://jurisdiction/us/tx-rrc", strictness: HARD } ;
  DECLARE BOUNDARY tx_rrc_filing_boundary AS BOUNDARY_TENSOR { ... strictness: HARD } ;
  DECLARE CONSTRAINT tx_rrc_production_rules AS CONSTRAINT_MATRIX { source: "udm://module/tx-rrc-production-v3", version: "3.2.0", digest: "computed-by-ios+" } ;
  DECLARE CONSTRAINT tx_rrc_filing_rules AS CONSTRAINT_MATRIX { source: "udm://module/tx-rrc-filing-v2", version: "2.0.0", digest: "computed-by-ios+" } ;
}

BEGIN
  INJECT ( tx_rrc_production_rules, packet_ctx ) ;
  LET draft        = AI_INFER("Resolve missing PR-202 fields ... TX-RRC, period 2026-Q3", packet_ctx) ;
  LET packet       = FUSE ( draft, tx_rrc_production_rules ) ;
  LET packet_trace = CAPTURE_TRACE ( packet ) INTO ct_packet ;
  LET packet_turn  = BIND ( field_operator, ct_packet ) AS turn_packet ;

  LET interim   = CAPTURE ( turn_packet ) AS interim_receipt ;
  LET packet_ok = VERIFY ( interim_receipt, field_operator ) ;

  IF_AUTHORITY ( field_operator, LT, 0.8 ) THEN {
    INJECT ( tx_rrc_filing_rules, filing_ctx ) ;
    LET filed       = FUSE ( packet, tx_rrc_filing_rules ) UNDER compliance_officer ;
    LET filed_trace = CAPTURE_TRACE ( filed ) INTO ct_filed ;
    LET final_turn  = BIND ( compliance_officer, ct_filed ) AS turn_final ;
  } ELSE {
    LET filed2 = FUSE ( packet, tx_rrc_filing_rules ) ;
    ...
  }
END

RECEIPT { CAPTURE ( turn_final ) AS filing_receipt WITH_OUTCOME COMPLIANT ; }
```

What the logic says, in order:

1. The field operator holds authority 0.4 and can prepare a packet but not file.
   Its `propagation` delegates to the compliance officer.
2. The production rules are injected, the model drafts the missing PR-202 fields,
   and FUSE constrains that draft. The packet turn is bound to the operator, and
   an interim receipt is captured and self-verified.
3. Filing requires more authority than the operator has. `IF_AUTHORITY(...LT 0.8)`
   is true, so the filing FUSE runs `UNDER compliance_officer`, which is permitted
   only because the operator declared a delegation to that officer.
4. The final turn is bound to the compliance officer, and the terminal receipt is
   captured.

The escalation is the point: the operator cannot file, the delegation carries the
filing under the officer's authority, and the receipt records which identity was
bound when the filing happened.

---

## 3. What happens when it runs

`node run-wellsite.mjs` prints the governed ledger and the receipt:

```
TURN LEDGER
seq  identity                              outcome     entropy
1    allco/operator-014                   COMPLIANT   2.17
2    allco/compliance-001                 COMPLIANT   2.10

GOVERNANCE RECEIPT (terminal)
  boundIdentity            igl://identity/allco/compliance-001
  outcome                  COMPLIANT
  constraintMatrixDigest   8d32f9...
  algorithm                Ed25519
  signature                Dj4r4J... (verifies)
```

Turn 1 is the operator preparing the packet. Turn 2 is the compliance officer
filing, reached by delegation. The terminal receipt is bound to the compliance
identity, which is how you know the escalation actually happened.

---

## 4. The receipt, and verifying it without trusting the runtime

`node verify-receipt.mjs` reads `out/receipt.json` and checks two things using
only the receipt and the published public key:

1. the Ed25519 signature verifies over the receipt fields, and
2. the FUSE step recomputes: it re-derives `normalize(v x w)` from the stored
   input distribution and constraint weights and confirms support restriction,
   that any option the constraint zeroes carries zero mass, matching the stored
   output digest.

Nothing in that check trusts the process that produced the receipt. That is the
whole design: an outsider reaches the same result from the artifact alone.

---

## 5. The runtime, file by file

```
src/lexer.js         Tokeniser for the block grammar (Schedule A). Keywords,
                     operators, strings, numbers, -- comments.
src/parser.js        Recursive-descent parser to an AST. Follows the Schedule C
                     sample programs where they refine Schedule A.
src/check.js         Static checks before anything runs: block structure, INJECT
                     before inference, RECURSE depth > 0, one terminal CAPTURE.
src/iosplus.js       IOS+ orchestrator (Article X): identity and authority
                     resolution, constraint provision, receipt signing, trace
                     logging, sequence numbers. In-memory seams by default.
src/interpreter.js   The eight operators, the fixed evaluation order, boundary
                     enforcement, cognitive-trace sealing, turn-trace sequencing,
                     receipt issuance. FUSE math lives here and is recomputable.
src/sign.js          Ed25519 receipts, canonical JSON, standalone verify, and a
                     persistent key from a seed (Signer.fromSeed) so receipts are
                     attributable to a stable key across sessions.
src/adapters.js      Model seam: logprobs, logits, uniform adapters.
src/vendors.js       Multi-vendor adapters (OpenAI, Anthropic, Gemini, xAI,
                     Mistral, DeepSeek, Llama) mapping a scored choice to the seam.
src/d1.js            Cloudflare D1 adapter bound to the real udmcore tables:
                     boundary_rules, udm_obligations, ig_nodes, and receipt
                     persistence into audit_receipts / receipt_edges.
src/determination.js The governance core as IOS+ defines it: the deterministic
                     Collect-Decode-Position-Entail-Bind pipeline, the four-outcome
                     resolution contract (MATCHED / NO_MATCH / MULTI_MATCH /
                     INSUFFICIENT_DATA, fail closed), hash-chained re-verifiable
                     receipts, and the AI perimeter as strict downstream seams.
src/index.js         Entry points: run, verify, recomputeFuse.
```

Key functions a reviewer should read first:

- `interpreter.js` `execStatement` and `fuseDist` — the fixed order and the FUSE
  math with its recomputable record.
- `determination.js` `determine`, `resolvePosition`, `entail`, `sealReceipt`,
  `verifyDetermination` — the deterministic governance and the receipt chain.
- `sign.js` `signReceipt` / `verifyReceipt` — the signature envelope.
- `d1.js` `persistReceipt` — how a receipt lands in the real `audit_receipts` chain.

---

## 6. Two governance models in the tree, stated honestly

There are two governance mechanisms in this codebase, and a reviewer should know
why.

The FUSE interpreter (`interpreter.js`) implements the v1.0 spec's model: the
model proposes within a distribution and FUSE masks it, support restriction
enforced. The determination engine (`determination.js`) implements the model your
IOS+ guarantees actually describe: the answer is computed by deterministic
entailment before inference, and the model is downstream of truth, never deciding.
The determination model is the stronger governance claim and matches the deployed
udmcore. The reconciliation, in progress, is that FUSE is not the governance core;
it is at most a downstream constraint on how a model renders a determination.
`docs/PRODUCTION_READINESS.md` tracks this.

---

## 7. How to run and verify everything

```
npm test                   # full suite (conformance, adversarial, adapters, D1, determination)
node run-wellsite.mjs      # the WellSite governed session and its receipt
node verify-receipt.mjs    # verify that receipt from the artifact alone
node test/determination.mjs  # the entailment engine and the four-outcome contract
```

A reviewer who runs those has seen the logic execute, seen a receipt sealed, and
re-verified it independently, which is the standard this project holds itself to.
