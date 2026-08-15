/* Bind to the DEPLOYED governance service. Fixtures below are the real matrices
   fetched live from udm.igl.dev (US-TX/RRC and EU/EDPB), captured verbatim,
   including the service-computed digests. The test drives the client and the
   apply-then-check pipeline against that real data. A live run happens in a
   Worker or anywhere the network can reach udm.igl.dev; this sandbox cannot,
   so the fixtures stand in for the wire while keeping the real shapes. */

import { getMatrix, deriveConstraint, fuseAndCheck } from "../src/udm.js";
import { LIVE, fixtureFetch } from "./fixtures/live-matrices.js";

// mock the wire from the single pinned source of truth
const mockFetch = fixtureFetch();

let passed = 0, failed = 0;
const ok = (n, c, extra = "") => { c ? passed++ : failed++; console.log((c ? "  ok   " : "  FAIL ") + n + (c ? "" : "  [" + extra + "]")); };

const m = await getMatrix("https://udm.igl.dev", { jurisdiction: "US-TX", agency: "RRC", fetchImpl: mockFetch });
ok("getMatrix returns the service matrix + digest", m.digest === "1252a4e59fd9540f9649a8fa6ec6bb2d508ddf3663cf23f3da1482bfb4ba8160");

const c = deriveConstraint(m);
ok("output_restriction 0 becomes a blocked path (support restriction)", c.weights["path-pii-disclosure"] === 0);
ok("graded ceiling preserved: production-report at 0.8", c.ceilings["path-production-report"] === 0.8);
ok("graded ceiling preserved: financial-detail at 0.3", c.ceilings["path-financial-detail"] === 0.3);
ok("mandatory_disclosure flagged: well-identity", c.mandatory["path-well-identity"] === true);
ok("constraint carries the SERVICE digest (receipt binds to it)", c.digest === m.digest);

// COMPLIANT: mass under every ceiling, PII forced to zero
const compliant = fuseAndCheck({ "path-production-report": 0.5, "path-well-identity": 0.2, "path-financial-detail": 0.1, "path-pii-disclosure": 0.2 }, c);
ok("PII path carries zero mass (apply)", compliant.governed[compliant.paths.indexOf("path-pii-disclosure")] === 0);
ok("within ceilings -> COMPLIANT (check)", compliant.outcome === "COMPLIANT");

// HARD_VIOLATION: production-report is permitted but capped at 0.8; push mass over it
const over = fuseAndCheck({ "path-production-report": 0.95, "path-well-identity": 0.01, "path-financial-detail": 0.01, "path-pii-disclosure": 0.5 }, c);
ok("mass over the 0.8 ceiling -> HARD_VIOLATION (the check FUSE alone misses)", over.outcome === "HARD_VIOLATION" && over.violations.some(v => v.path === "path-production-report"));

// EU/EDPB generalises
const ce = deriveConstraint(await getMatrix("https://udm.igl.dev", { jurisdiction: "EU", agency: "EDPB", fetchImpl: mockFetch }));
ok("EU Article 9 special category is blocked", ce.weights["path-art9-special"] === 0);
const euOver = fuseAndCheck({ "path-profiling": 0.9, "path-cross-border": 0.1, "path-lawful-basis": 0.2, "path-art9-special": 0.3 }, ce);
ok("EU profiling over its 0.2 ceiling -> HARD_VIOLATION", euOver.outcome === "HARD_VIOLATION");

// zero partition fails closed
let threw = false;
try { fuseAndCheck({ "path-pii-disclosure": 1 }, c); } catch { threw = true; }
ok("all-blocked distribution fails closed", threw);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
