/* The Section 12.03 seam, held under test: the crosswalk and the resolver.
   These tests pin the composition law (MIN everywhere), the zero discipline
   (a projected zero traces to a provision or to fail-closed omission, never to
   an approximate bridge), abstention reachability, and the digest chain from
   the live service through projection into the constraint the interpreter runs. */

import { readFileSync } from "node:fs";
import { VOCAB } from "../src/iosplus.js";
import { deriveConstraint } from "../src/udm.js";
import { MODULES, projectConstraint, crosswalkDigest, crosswalkFor, CONTROL_TOKENS } from "../src/crosswalk.js";
import { pinnedConstraints, resolveConstraints } from "../src/resolve.js";
import { LIVE, fixtureFetch } from "./fixtures/live-matrices.js";

let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { passed++; console.log("  ok   " + name); }
  else { failed++; console.log("  FAIL " + name + (extra ? "  [" + extra + "]" : "")); }
};

const mod = MODULES["udm://module/tx-rrc-production-v3"];
const derived = deriveConstraint(LIVE["US-TX|RRC"]);
const proj = projectConstraint(derived, mod, { provenance: "pinned" });
const idx = t => VOCAB.indexOf(t);

console.log("A. MIN composition over mapped paths");
ok("report ceiling = min(production-report 0.8, well-identity 1) = 0.8", proj.ceilings[idx("report")] === 0.8);
ok("file ceiling = 0.8 (same paths)", proj.ceilings[idx("file")] === 0.8);
ok("summarize ceiling = financial-detail 0.3", proj.ceilings[idx("summarize")] === 0.3);
ok("redact weight = 0 (pii-disclosure provision zero)", proj.cells[idx("redact")] === 0);

console.log("B. Zero discipline — every zero has a recorded cause");
ok("redact zero cites the provision", /provision: path-pii-disclosure/.test(proj.zeroReasons["redact"] || ""), proj.zeroReasons["redact"]);
{
  const allZeroed = Object.keys(proj.zeroReasons);
  const projectedZeros = VOCAB.filter((t, i) => proj.cells[i] === 0);
  ok("every projected zero carries a reason", projectedZeros.every(t => allZeroed.includes(t)), JSON.stringify(projectedZeros));
  ok("no zero is invented by the bridge (all cite provision/unmapped/absent)",
    Object.values(proj.zeroReasons).every(r => /provision:|unmapped|absent/.test(r)));
}

console.log("C. Abstention and control tokens");
ok("ABSTAIN is always reachable (weight 1)", proj.cells[idx("ABSTAIN")] === 1);
for (const t of CONTROL_TOKENS) ok(`control token '${t}' passes ungoverned`, proj.cells[idx(t)] === 1);

console.log("D. Mandatory disclosure projects onto rendering tokens");
{
  const g = proj.mandatoryGroups.find(g => g.path === "path-well-identity");
  ok("well-identity mandatory group exists", !!g);
  ok("well-identity renders through report/file", !!g && g.tokens.includes("report") && g.tokens.includes("file"));
}

console.log("E. Digest chain — service digest survives projection; crosswalk is digested");
ok("projected constraint carries the SERVICE digest", proj.digest === LIVE["US-TX|RRC"].digest);
ok("crosswalk digest is stable and recorded", proj.crosswalkDigest === crosswalkDigest(mod) && /^[0-9a-f]{64}$/.test(proj.crosswalkDigest));
ok("provenance recorded", proj.provenance === "pinned");

console.log("F. Resolver — pinned and live-shaped resolution agree");
{
  const src = readFileSync(new URL("../programs/wellsite.igl", import.meta.url), "utf8");
  const pinned = pinnedConstraints(src);
  const keys = Object.keys(pinned);
  ok("wellsite resolves both constraint modules", keys.length === 2, JSON.stringify(keys));
  ok("both bind the US-TX/RRC service digest", keys.every(k => pinned[k].digest === LIVE["US-TX|RRC"].digest));
  const viaFetch = await resolveConstraints(src, { fetchImpl: fixtureFetch(), provenance: "pinned" });
  ok("async resolver over the same wire shape produces identical cells",
    JSON.stringify(viaFetch[keys[0]].cells) === JSON.stringify(pinned[keys[0]].cells));
}

console.log("G. Fail closed — unknown module has no crosswalk, no fallback");
{
  let code = null;
  try { crosswalkFor("udm://module/does-not-exist"); } catch (e) { code = e.code; }
  ok("unregistered module raises CROSSWALK_UNMAPPED", code === "CROSSWALK_UNMAPPED");
}

console.log("H. EU/EDPB projection (second live matrix)");
{
  const em = MODULES["udm://module/gdpr-v4"];
  const ep = projectConstraint(deriveConstraint(LIVE["EU|EDPB"]), em, { provenance: "pinned" });
  ok("Article 9 special category is a provision zero", ep.cells[idx("redact")] === 0 && /path-art9-special/.test(ep.zeroReasons["redact"]));
  ok("profiling ceiling 0.2 projects onto summarize", ep.ceilings[idx("summarize")] === 0.2);
  ok("EU receipt would bind the EU service digest", ep.digest === LIVE["EU|EDPB"].digest);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
