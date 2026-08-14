/* Constraint resolution — the async step that runs BEFORE interpretation.

   The interpreter is synchronous by design (fixed evaluation order, Article VII);
   the live UDM service is an async fetch. govern.js already solved this for the
   single-turn path: fetch first, then compute. This module generalises that to
   whole Programs: parse, collect every CONSTRAINT_MATRIX with a udm:// source,
   fetch each live matrix (or serve it from the pinned fixtures), project it onto
   the vocabulary through the explicit crosswalk, and hand the interpreter a
   fully-resolved constraint map. Interpretation then proceeds synchronously with
   no network and no stand-ins.

   Provenance is carried per matrix and lands in the receipt:
     "live"    fetched from udm.igl.dev on this run
     "pinned"  served from test/fixtures/live-matrices.js (real service digests,
               captured from the wire; the drift workflow guards staleness)
   The deterministic stand-in is NOT reachable through this module. It exists
   only behind the interpreter's explicit `offline: true` flag, and its digests
   are prefixed "standin-" so they can never collide with a service digest. */

import { parse } from "./parser.js";
import { getMatrix, deriveConstraint, UDM_SERVICE } from "./udm.js";
import { crosswalkFor, projectConstraint } from "./crosswalk.js";
import { LIVE } from "../test/fixtures/live-matrices.js";
import { valueOf } from "./iosplus.js";

function matrixDecls(programOrSource) {
  const program = typeof programOrSource === "string" ? parse(programOrSource) : programOrSource;
  return program.constraints.matrices.map(m => {
    const f = m.matrix.fields;
    return { name: m.name, source: valueOf(f.source), version: valueOf(f.version) };
  });
}

/* Resolve every udm:// constraint in a Program against the live service,
   returning the constraint map the Interpreter consumes. Fail closed: an
   unregistered module or an unreachable service is an error, never a stand-in. */
export async function resolveConstraints(programOrSource, {
  base = UDM_SERVICE, fetchImpl = globalThis.fetch, provenance = "live",
} = {}) {
  const decls = matrixDecls(programOrSource);
  const matrices = {};
  for (const d of decls) {
    if (!d.source?.startsWith("udm://")) continue;
    const module_ = crosswalkFor(d.source);       // throws CROSSWALK_UNMAPPED — fail closed
    const raw = await getMatrix(base, { jurisdiction: module_.jurisdiction, agency: module_.agency, fetchImpl });
    const derived = deriveConstraint(raw);
    matrices[`${d.source}|${d.version}`] = projectConstraint(derived, module_, { provenance });
  }
  return matrices;
}

/* Hermetic resolution from the pinned live fixtures — synchronous, no network.
   The fixtures carry the digests the service itself computed, captured from the
   wire; the matrix-drift workflow fails loudly if the service ever diverges. */
export function pinnedConstraints(programOrSource) {
  const decls = matrixDecls(programOrSource);
  const matrices = {};
  for (const d of decls) {
    if (!d.source?.startsWith("udm://")) continue;
    const module_ = crosswalkFor(d.source);
    const raw = LIVE[`${module_.jurisdiction}|${module_.agency}`];
    if (!raw) {
      const e = new Error(`no pinned fixture for ${module_.jurisdiction}/${module_.agency}`);
      e.code = "FIXTURE_MISSING"; throw e;
    }
    const derived = deriveConstraint(raw);
    matrices[`${d.source}|${d.version}`] = projectConstraint(derived, module_, { provenance: "pinned" });
  }
  return matrices;
}
