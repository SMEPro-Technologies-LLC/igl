/* Identity registry — EXAMPLE. Copy this file to `identities.mjs` and replace
   the entry with your own caller(s). `identities.mjs` is gitignored on purpose:
   real caller keys are credentials and never belong in version control.

   The key IS the login. It lives in the client configuration once; every
   session after that opens with the runtime already knowing whose graph this
   is. On first contact the actor's graph is seeded from the stored profile
   (one-time boot); after that, recognition is a replay of the hash-chained
   journal — instant, idempotent, and theirs.

   Keys are NOT the service gate (PROVISION_API_KEY protects the endpoint);
   these are per-person caller identities resolved AFTER the gate. */

export const IDENTITIES = {
  "igm-example-caller-REPLACE_ME": {
    actor: "Example_Caller",
    name: "Example Caller",
    kind: "FOOTPRINT", // FOOTPRINT = individual, BOUNDARY = company
    role: "engineer",
    description:
      "Example Caller is an engineer evaluating IGL identity governed computation",
  },
};

export function resolveCaller(key) {
  if (!key) return null;
  return IDENTITIES[key] ?? null;
}
