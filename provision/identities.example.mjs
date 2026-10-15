/* Example caller registry. Copy this file to `identities.mjs` and replace the
   sample entry with your caller's key and profile. `identities.mjs` is ignored
   by Git because it contains credentials.

   The first request creates the caller's graph from the profile. Later
   requests replay its journal. Caller keys identify individual clients.
   `PROVISION_API_KEY` is a separate, optional key for the service endpoint. */

export const IDENTITIES = {
  "igm-example-caller-REPLACE_ME": {
    actor: "Example_Caller",
    name: "Example Caller",
    kind: "FOOTPRINT", // FOOTPRINT = individual, BOUNDARY = company
    role: "engineer",
    description:
      "Example Caller is an engineer testing the IGL runtime",
  },
};

export function resolveCaller(key) {
  if (!key) return null;
  return IDENTITIES[key] ?? null;
}
