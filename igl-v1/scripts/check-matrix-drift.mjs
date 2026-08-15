/* Drift detection: fetch the live matrices and assert their digests still equal
   the pinned fixtures. Runs on a schedule and on demand, NOT in the PR-blocking
   suite, so a moved live digest fails loudly here without holding PRs hostage to
   Worker uptime. Requires network to udm.igl.dev (GitHub runners have it). */
import { getMatrix } from "../src/udm.js";
import { LIVE, SERVICE } from "../test/fixtures/live-matrices.js";

let drift = 0;
for (const [key, pinned] of Object.entries(LIVE)) {
  const [jurisdiction, agency] = key.split("|");
  try {
    const live = await getMatrix(SERVICE, { jurisdiction, agency });
    const same = live.digest === pinned.digest;
    console.log(`${same ? "ok  " : "DRIFT"} ${key}  pinned ${pinned.digest.slice(0, 12)}  live ${String(live.digest).slice(0, 12)}  version ${live.version}`);
    if (!same) drift++;
  } catch (e) {
    console.log(`ERROR ${key}: ${e.message}`);
    drift++;
  }
}
console.log(drift ? `\n${drift} matrix(es) drifted from the pinned fixtures. Update fixtures and review.` : "\nno drift: fixtures match the live service.");
process.exit(drift ? 1 : 0);
