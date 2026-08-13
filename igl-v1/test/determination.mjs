/* Determination engine tests: the four-outcome resolution contract, byte-for-byte
   re-verifiable receipts, FORECAST deltas, and the AI-downstream perimeter. */

import { determine, forecast, renderDetermination, verifyDetermination, OUTCOME } from "../src/determination.js";
import { Signer } from "../src/sign.js";

const crosswalk = {
  "restaurant": { code: "722511", subsector: "Restaurants & Food Service", domain: "Hospitality" },
  "on-premise alcohol": { code: "722511", subsector: "Restaurants & Food Service", domain: "Hospitality" },
  "consulting": { code: "5416", subsector: "Professional Services", domain: "Services" },
  "software": { code: "5112", subsector: "Software Publishing", domain: "Technology" },
};
const obligations = [
  { id: "irs-941", sector_code: "722511", jurisdiction: "US", agency: "IRS", obligation: "File quarterly employment tax (941)", citation: "26 USC 3111" },
  { id: "tabc", sector_code: "722511", jurisdiction: "US-TX", agency: "TABC", obligation: "Hold on-premise alcohol permit", citation: "TX ABC 25" },
  { id: "aph", sector_code: "722511", jurisdiction: "TX-Austin", agency: "Austin Public Health", obligation: "Food enterprise permit", citation: "Austin Code 10-3" },
  { id: "aca", sector_code: "722511", jurisdiction: "US", agency: "IRS", obligation: "ACA employer shared responsibility", citation: "26 USC 4980H", when: { metric: "FTE", op: ">=", value: 50 } },
];
const sources = { crosswalk, obligations };
const signer = Signer.fromSeed("udm.igl.dev", Buffer.alloc(32, 7));

const acme = {
  tenantId: "acme", organization: "ACME Dining LLC",
  jurisdictionStack: ["US", "US-TX", "TX-Travis", "TX-Austin"],
  facts: { activities: ["restaurant", "on-premise alcohol"], address: "Austin, TX", entityForm: "LLC", metrics: { FTE: 45 } },
};

let passed = 0, failed = 0;
const ok = (n, c, extra = "") => { c ? passed++ : failed++; console.log((c ? "  ok   " : "  FAIL ") + n + (c ? "" : "  [" + extra + "]")); };

// MATCHED
const d = determine(acme, sources, { signer });
ok("MATCHED: position resolves", d.outcome === OUTCOME.MATCHED);
ok("obligations entailed with citations", d.obligations.length === 3 && d.citations.includes("TX ABC 25"));
ok("threshold obligation excluded below 50 FTE (no ACA)", !d.obligations.some(o => o.id === "aca"));
ok("determination receipt re-verifies byte for byte", verifyDetermination(d.receipt).ok);

// determinism: answer_hash independent of wall clock
const d2 = determine(acme, sources, { signer });
ok("deterministic: same facts give same answer_hash", d.receipt.answer_hash === d2.receipt.answer_hash);

// tamper
const tampered = JSON.parse(JSON.stringify(d.receipt));
tampered.payload.obligations = tampered.payload.obligations.slice(0, 1);
ok("altering the determination is caught", verifyDetermination(tampered).ok === false);

// INSUFFICIENT_DATA (fail closed)
const noAddr = { ...acme, facts: { ...acme.facts, address: "" } };
const di = determine(noAddr, sources, { signer });
ok("INSUFFICIENT_DATA when a required fact is missing", di.outcome === OUTCOME.INSUFFICIENT_DATA && di.missing.includes("address"));
ok("fail-closed receipt still seals and verifies", di.receipt.kind === "INSUFFICIENT_DATA" && verifyDetermination(di.receipt).ok);

// MULTI_MATCH (no tie-break resolution)
const ambiguous = { ...acme, facts: { ...acme.facts, activities: ["consulting", "software"] } };
const dm = determine(ambiguous, sources, { signer });
ok("MULTI_MATCH when codes tie and no tie-break resolves", dm.outcome === OUTCOME.MULTI_MATCH);

// FORECAST: grow past the ACA threshold
const f = forecast(acme, { setMetrics: { FTE: 55 } }, sources, { signer });
ok("FORECAST adds ACA obligation past 50 FTE", f.added.some(o => o.id === "aca") && f.removed.length === 0);

// AI perimeter: render is downstream and does not change the determination
const before = JSON.stringify(d.obligations);
const prose = renderDetermination(d);
ok("render produces prose without altering the determination", typeof prose === "string" && JSON.stringify(d.obligations) === before);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
