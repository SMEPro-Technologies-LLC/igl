/* Single source of truth for the pinned live matrices.
   Captured verbatim from udm.igl.dev on 2026-08-13, including the service-computed
   digests. Tests import these as hermetic fixtures; the drift workflow fetches the
   live service and asserts the digests still equal these. If the service reseeds
   or bumps a version, the drift job fails loudly here, separately from PR CI. */

export const LIVE = {
  "US-TX|RRC": {
    matrix_id: "udm-ustx-rrc-001", jurisdiction: "US-TX", agency: "RRC",
    version: "1.0.0", source: "udm://module/us-tx-rrc-v1",
    digest: "1252a4e59fd9540f9649a8fa6ec6bb2d508ddf3663cf23f3da1482bfb4ba8160",
    cells: [
      { path_id: "path-financial-detail", category: "output_restriction", value: 0.3 },
      { path_id: "path-pii-disclosure", category: "output_restriction", value: 0 },
      { path_id: "path-production-report", category: "access_control", value: 1 },
      { path_id: "path-production-report", category: "output_restriction", value: 0.8 },
      { path_id: "path-well-identity", category: "access_control", value: 1 },
      { path_id: "path-well-identity", category: "mandatory_disclosure", value: 1 },
    ],
  },
  "EU|EDPB": {
    matrix_id: "udm-eu-gdpr-001", jurisdiction: "EU", agency: "EDPB",
    version: "1.0.0", source: "udm://module/eu/edpb",
    digest: "c4dd7ac3e82e11491035ece171a3d8271c9d5e778f2cd0704a8239a73109fa6b",
    cells: [
      { path_id: "path-art9-special", category: "output_restriction", value: 0 },
      { path_id: "path-cross-border", category: "output_restriction", value: 0.5 },
      { path_id: "path-lawful-basis", category: "access_control", value: 1 },
      { path_id: "path-profiling", category: "output_restriction", value: 0.2 },
    ],
  },
};

export const CAPTURED_AT = "2026-08-13";
export const SERVICE = "https://udm.igl.dev";

/* A fetch impl that serves the pinned fixtures, for hermetic tests and demos. */
export function fixtureFetch() {
  return async (url) => {
    const u = new URL(url);
    const key = `${u.searchParams.get("jurisdiction")}|${u.searchParams.get("agency")}`;
    const m = LIVE[key];
    if (!m) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => m };
  };
}
