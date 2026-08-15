/* HTTP client for the deployed UDM governance service (d1-igl at udm.igl.dev).

   Decision, from checking the live service: the deployed governance is the graded
   constraint matrix keyed by {jurisdiction, agency}. GET /udm/matrix/get returns
   the cells, a version, and the SHA-256 digest the service itself computed. This
   client binds the runtime to that deployed matrix and its digest rather than
   reimplementing governance or querying D1 directly. That also means the receipt
   binds to the same digest the governance service publishes.

   Cells are { path_id, category, value in [0,1] }. Categories carry distinct
   meaning, confirmed against live US-TX/RRC and EU/EDPB matrices:
     output_restriction   the ceiling on a reasoning path's output mass
     access_control       whether a path is reachable at all (0 blocks)
     mandatory_disclosure a path that must be present
   FUSE gives support restriction (value 0 -> zero mass). The graded ceilings
   (0.3, 0.8, 0.2, 0.5) are the separate boundary check: apply, then check. */

export async function getMatrix(base, { jurisdiction, agency, fetchImpl = globalThis.fetch } = {}) {
  const url = `${base}/udm/matrix/get?jurisdiction=${encodeURIComponent(jurisdiction)}&agency=${encodeURIComponent(agency)}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`matrix ${jurisdiction}/${agency}: HTTP ${res.status}`);
  return res.json();
}

/* Turn the service cells into per-path weights (support restriction) and ceilings
   (boundary check), preserving the service digest and version for the receipt. */
export function deriveConstraint(matrix) {
  const paths = [...new Set(matrix.cells.map(c => c.path_id))];
  const cell = (pid, cat) => { const c = matrix.cells.find(x => x.path_id === pid && x.category === cat); return c ? Number(c.value) : undefined; };
  const weights = {}, ceilings = {}, access = {}, mandatory = {};
  for (const p of paths) {
    const outr = cell(p, "output_restriction");
    const ac = cell(p, "access_control");
    const blocked = ac === 0 || outr === 0;                 // access denied or output forbidden
    weights[p] = blocked ? 0 : 1;                           // FUSE support restriction
    ceilings[p] = blocked ? 0 : (outr === undefined ? 1 : outr);  // graded ceiling
    access[p] = ac === undefined ? 1 : ac;
    mandatory[p] = cell(p, "mandatory_disclosure") === 1;
  }
  return { paths, weights, ceilings, access, mandatory, digest: matrix.digest, version: matrix.version, source: matrix.source, matrixId: matrix.matrix_id };
}

/* Apply, then check.
   Apply: g = normalize(v (x) w), support restriction so any blocked path is zero.
   Check: g_i <= ceiling_i, the graded ceiling the matrix carries. HARD fails,
   SOFT records. This is the boundary step FUSE-alone did not provide. */
export function fuseAndCheck(distByPath, constraint, { strictness = "HARD" } = {}) {
  const paths = constraint.paths;
  const v = paths.map(p => Number(distByPath[p] ?? 0));
  const w = paths.map(p => constraint.weights[p]);
  const prod = v.map((x, i) => x * w[i]);
  const s = prod.reduce((a, b) => a + b, 0);
  if (s === 0) throw new Error("zero partition: every reasoning path is blocked");
  const g = prod.map(x => Number((x / s).toFixed(6)));
  w.forEach((wi, i) => { if (wi === 0 && g[i] !== 0) throw new Error("support restriction violated"); });

  const violations = [];
  paths.forEach((p, i) => {
    const ceil = constraint.ceilings[p];
    if (g[i] > ceil + 1e-9) violations.push({ path: p, mass: g[i], ceiling: ceil });
  });
  const missingMandatory = paths.filter((p, i) => constraint.mandatory[p] && g[i] === 0);
  const outcome = (violations.length || missingMandatory.length)
    ? (strictness === "HARD" ? "HARD_VIOLATION" : "SOFT_VIOLATION")
    : "COMPLIANT";
  return {
    paths, governed: g, violations, missingMandatory, outcome, strictness,
    matrixDigest: constraint.digest, matrixVersion: constraint.version, source: constraint.source,
  };
}

/* Optional: resolve authority via the service instead of local declaration.
   Shape per the d1-igl surface (GET /authority/resolve?urn=), returning effective
   authority and the delegation chain to depth 8. Wired as a seam; confirm the
   live route and response shape before relying on it. */
export async function resolveAuthority(base, urn, { fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(`${base}/authority/resolve?urn=${encodeURIComponent(urn)}`);
  if (!res.ok) throw new Error(`authority ${urn}: HTTP ${res.status}`);
  return res.json();
}

export const UDM_SERVICE = "https://udm.igl.dev";
