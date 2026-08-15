// SPDX-License-Identifier: Apache-2.0
/* Deploy entry for the igl-api execution surface.
   This is the surface that answers real traffic. It is the SAME live-bound path
   the tests exercise: src/worker.js -> govern.js -> udm.js -> the deployed matrix
   at udm.igl.dev. Kept as a one-line re-export so there is exactly one worker
   implementation and no second copy to drift. Wrangler bundles the src graph. */
export { default } from "../../src/worker.js";
