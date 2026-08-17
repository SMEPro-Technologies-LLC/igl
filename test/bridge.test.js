import { test } from "node:test";
import assert from "node:assert/strict";
import { Bridge, ABSTAIN, parseSpan, sha256 } from "../src/bridge.js";
import { UDMRuntime } from "../src/runtime.js";
import { DEFAULT_DIMENSIONS } from "../src/graph.js";

const mk = (o = {}) => new Bridge({ dimensions: DEFAULT_DIMENSIONS, ...o });

const FORM_SLOT = { name: "form", kind: "code", admissible: ["PR-202", "H-10", "W-10"], required: true };
const JUR_SLOT = { name: "jurisdiction", kind: "code", dimension: "Jurisdiction", admissible: ["US-TX"] };

/* ================= γ ================= */
test("γ turns the admissible set into a schema enum, not a suggestion", () => {
  const env = mk().gamma({ AgencyCode: "TX-RRC" }, [FORM_SLOT]);
  assert.deepEqual(env.schema.properties.form.enum, ["PR-202", "H-10", "W-10", ABSTAIN]);
  assert.deepEqual(env.schema.required, ["form"]);
  assert.equal(env.schema.additionalProperties, false);
});

test("ABSTAIN is always reachable — a masked vocabulary must not force a choice", () => {
  const env = mk().gamma({}, [FORM_SLOT]);
  assert.ok(env.schema.properties.form.enum.includes(ABSTAIN));
});

test("γ refuses to declare a generated quantity", () => {
  assert.throws(() => mk().gamma({}, [{ name: "volume", kind: "number" }]),
    e => e.code === "IGL_BAD_SLOT_KIND" && /may never be generated/.test(e.message));
});

test("γ requires an explicit parse on span slots", () => {
  assert.throws(() => mk().gamma({}, [{ name: "x", kind: "span" }]),
    e => e.code === "IGL_SPAN_NEEDS_PARSE");
});

/* R1 — the automaton, not a union */
test("maskPlan is a prefix automaton: recombinations of admissible values are unreachable", () => {
  const tokenizer = { encode: s => [...s].map(c => c.charCodeAt(0)) };
  const env = mk({ tokenizer }).gamma({}, [FORM_SLOT]);
  const auto = env.maskPlan.form;
  assert.equal(auto.type, "prefix-automaton");

  const ids = s => [...s].map(c => c.charCodeAt(0));
  /* at the root: P, H, W and _ (ABSTAIN) begin admissible values; nothing else */
  const root = Bridge.maskNext(auto, []);
  assert.deepEqual(root.allowed.map(c => String.fromCharCode(c)).sort(), ["H", "P", "W", "_"]);
  /* after "PR-" only "2" continues (PR-202); the "1" of H-10/W-10 is NOT allowed —
     the flat union would have admitted it and with it PR-10 */
  const afterPR = Bridge.maskNext(auto, ids("PR-"));
  assert.deepEqual(afterPR.allowed.map(c => String.fromCharCode(c)), ["2"]);
  /* after "H-1" only "0", and completing it is accepting */
  assert.deepEqual(Bridge.maskNext(auto, ids("H-1")).allowed.map(c => String.fromCharCode(c)), ["0"]);
  assert.equal(Bridge.maskNext(auto, ids("H-10")).accepting, true);
  /* a prefix outside the language is dead, immediately */
  assert.equal(Bridge.maskNext(auto, ids("PR-1")), null);
  assert.equal(env.manifest.constrainedDecoding, true);
});

test("BPE EDGE: the trie is over each full string's actual encoding, so merges across visual boundaries are handled", () => {
  /* A BPE tokenizer merges greedily, so two values that diverge mid-token
     produce entirely different id sequences — H-10 and W-10 share the visual
     suffix "-10" but need not share its tokens with anything else. The trie
     must be built from encode(fullString), never from per-segment encoding. */
  const enc = {
    "PR-202": [10, 11, 12],      /* "PR", "-20", "2"          */
    "H-10": [20, 21],            /* "H", "-10" (merged)       */
    "W-10": [30, 21],            /* "W", "-10" (same merge)   */
    [ABSTAIN]: [99],
  };
  const tokenizer = { encode: s => { if (!(s in enc)) throw new Error("segment encoding attempted: " + s); return enc[s]; } };
  const env = mk({ tokenizer }).gamma({}, [FORM_SLOT]);
  const auto = env.maskPlan.form;

  assert.deepEqual(Bridge.maskNext(auto, []).allowed.sort((a, b) => a - b), [10, 20, 30, 99]);
  /* after H's first token, only the merged "-10" continues; PR-202's tokens never appear */
  assert.deepEqual(Bridge.maskNext(auto, [20]).allowed, [21]);
  assert.equal(Bridge.maskNext(auto, [20, 21]).accepting, true);
  /* the shared merged token 21 is NOT reachable from PR's prefix */
  assert.deepEqual(Bridge.maskNext(auto, [10]).allowed, [11]);
  assert.equal(Bridge.maskNext(auto, [10, 21]), null, "cross-value recombination is dead at the automaton");
});

/* R4 — digests */
test("manifest digests are SHA-256 over canonical JSON — key order does not change the digest", () => {
  const b = mk();
  const d1 = b.gamma({ A: 1, B: 2 }, [FORM_SLOT]).manifest.scopeDigest;
  const d2 = b.gamma({ B: 2, A: 1 }, [FORM_SLOT]).manifest.scopeDigest;
  assert.equal(d1, d2, "equivalent scopes must digest identically");
  assert.match(d1, /^[0-9a-f]{64}$/, "SHA-256, not a 64-bit toy hash");
});

/* ================= α — projection ================= */
test("an admissible value passes through exactly", () => {
  const b = mk(), env = b.gamma({}, [FORM_SLOT]);
  const r = b.alpha({ form: "PR-202" }, env, {});
  assert.equal(r.slots.form.value, "PR-202");
  assert.equal(r.projections.length, 0);
});

test("a value outside the set is unmapped, never silently accepted", () => {
  const b = mk({ strictness: "exact" }), env = b.gamma({}, [FORM_SLOT]);
  const r = b.alpha({ form: "PR-999" }, env, {});
  assert.equal(r.slots.form, undefined);
  assert.deepEqual(r.unmapped[0], { slot: "form", reason: "not-in-set", candidate: "PR-999" });
});

test("lattice: a specialisation of an admissible value is accepted and recorded", () => {
  const b = mk(), env = b.gamma({}, [JUR_SLOT]);
  const r = b.alpha({ jurisdiction: "TX-RRC" }, env, {});
  assert.equal(r.slots.jurisdiction.value, "TX-RRC");
  assert.equal(r.projections[0].how, "specialised");
  assert.equal(r.projections[0].coveredBy, "US-TX");
});

test("lattice: a GENERALISATION is refused — broader than allowed is the move governance exists to stop", () => {
  const b = mk(), env = b.gamma({}, [{ name: "jurisdiction", kind: "code", dimension: "Jurisdiction", admissible: ["TX-RRC"] }]);
  const r = b.alpha({ jurisdiction: "US-TX" }, env, {});
  assert.equal(r.slots.jurisdiction, undefined);
  assert.equal(r.unmapped[0].reason, "generalisation-refused");
  assert.equal(r.unmapped[0].wouldBroaden, "TX-RRC");
});

/* R3 — fuzzy discipline */
test("fuzzy normalisation repairs an enum and records the repair", () => {
  const b = mk({ strictness: "fuzzy" });
  const env = b.gamma({}, [{ name: "dx", kind: "enum", admissible: ["asbestosis", "silicosis"] }]);
  const r = b.alpha({ dx: "Asbestosis" }, env, {});
  assert.equal(r.slots.dx.value, "asbestosis");
  assert.equal(r.slots.dx.projectedBy, "normalised");
});

test("fuzzy edit distance refuses ties rather than resolving them by array order", () => {
  const b = mk({ strictness: "fuzzy" });
  const env = b.gamma({}, [{ name: "code", kind: "enum", admissible: ["H-10", "W-10"] }]);
  const r = b.alpha({ code: "X-10" }, env, {});
  assert.equal(r.slots.code, undefined, "X-10 is distance 1 from both — a silent pick is a wrong pick half the time");
  assert.equal(r.unmapped[0].reason, "ambiguous");
  assert.deepEqual(r.unmapped[0].candidates.sort(), ["H-10", "W-10"]);
});

test("fuzzy edit distance NEVER applies to codes — a one-edit repair is a different instrument", () => {
  const b = mk({ strictness: "fuzzy" });
  const env = b.gamma({}, [{ name: "jur", kind: "code", dimension: "Jurisdiction", admissible: ["US-TX"] }]);
  const r = b.alpha({ jur: "US-TN" }, env, {});
  assert.equal(r.slots.jur, undefined, "US-TN must not be repaired to US-TX");
  assert.equal(r.unmapped[0].reason, "not-in-set");
});

test("abstention is honoured rather than coerced into a value", () => {
  const b = mk(), env = b.gamma({}, [FORM_SLOT]);
  const r = b.alpha({ form: ABSTAIN }, env, {});
  assert.equal(r.slots.form, undefined);
  assert.deepEqual(r.abstained, [{ slot: "form" }]);
});

/* ================= α — the numbers rule ================= */
const DOC = "Provider 14 statement.\nTotal charges: $1,247,893.00 for the period.\nDate of service: 2019-04-11.";
const source = id => (id === "USSH004120" ? DOC : null);
const MANIFEST = { USSH004120: sha256(DOC) };
const OFFSET = DOC.indexOf("$1,247,893.00");
const AMOUNT_SLOT = { name: "total", kind: "span", parse: "currency", required: true };

test("THE NUMBERS RULE: the quantity is read from source in integer minor units", () => {
  const b = mk(), env = b.gamma({}, [AMOUNT_SLOT]);
  const r = b.alpha({ total: { file: "USSH004120", charOffset: OFFSET, length: 13 } }, env,
    { source, manifest: MANIFEST, confidences: { total: 0.9 } });
  assert.equal(r.slots.total.value, 124789300, "cents, not a float of dollars");
  assert.equal(r.slots.total.units, "minor");
  assert.equal(r.slots.total.valueClass, "deterministic");
  assert.equal(r.slots.total.evidence.chars, "$1,247,893.00");
  assert.equal(r.slots.total.evidence.docSha256, MANIFEST.USSH004120, "the citation pins the document digest");
});

/* R7 — schema enforced locally */
test("a span carrying extra properties violates the schema and is refused — the model's transcription never enters", () => {
  const b = mk(), env = b.gamma({}, [AMOUNT_SLOT]);
  const r = b.alpha({ total: { file: "USSH004120", charOffset: OFFSET, length: 13, value: 999 } }, env,
    { source, manifest: MANIFEST, confidences: { total: 0.9 } });
  assert.equal(r.slots.total, undefined);
  assert.match(r.unmapped[0].reason, /unexpected property: value/);
});

test("undeclared top-level properties are surfaced, not silently ignored", () => {
  const b = mk(), env = b.gamma({}, [FORM_SLOT]);
  const r = b.alpha({ form: "PR-202", bank_account: "12345" }, env, {});
  assert.ok(r.unmapped.some(u => u.slot === "bank_account" && /undeclared/.test(u.reason)));
});

test("a file outside the corpus manifest is refused; a digest mismatch is refused", () => {
  const b = mk(), env = b.gamma({}, [AMOUNT_SLOT]);
  const r1 = b.alpha({ total: { file: "../../etc", charOffset: 0, length: 3 } }, env,
    { source: () => "xyz", manifest: MANIFEST, confidences: { total: 0.9 } });
  assert.match(r1.unmapped[0].reason, /not in the corpus manifest/);
  const r2 = b.alpha({ total: { file: "USSH004120", charOffset: OFFSET, length: 13 } }, env,
    { source: () => DOC + " tampered", manifest: MANIFEST, confidences: { total: 0.9 } });
  assert.match(r2.unmapped[0].reason, /digest mismatch/);
});

test("a span that does not parse is unmapped — no repair, no guess", () => {
  const b = mk(), env = b.gamma({}, [AMOUNT_SLOT]);
  const r = b.alpha({ total: { file: "USSH004120", charOffset: 0, length: 8 } }, env,
    { source, manifest: MANIFEST, confidences: { total: 0.9 } });
  assert.equal(r.slots.total, undefined);
  assert.match(r.unmapped[0].reason, /did not parse as currency/);
});

test("an out-of-bounds span is refused rather than clamped", () => {
  const b = mk(), env = b.gamma({}, [AMOUNT_SLOT]);
  const r = b.alpha({ total: { file: "USSH004120", charOffset: 5, length: 99999 } }, env,
    { source, manifest: MANIFEST, confidences: { total: 0.9 } });
  assert.equal(r.unmapped[0].reason, "span out of bounds");
});

test("date spans parse deterministically to ISO", () => {
  const b = mk(), env = b.gamma({}, [{ name: "dos", kind: "span", parse: "date" }]);
  const off = DOC.indexOf("2019-04-11");
  const r = b.alpha({ dos: { file: "USSH004120", charOffset: off, length: 10 } }, env,
    { source, manifest: MANIFEST, confidences: { dos: 0.9 } });
  assert.equal(r.slots.dos.value, "2019-04-11");
});

test("currency beyond the safe-integer range degrades to a decimal string, never a float", () => {
  assert.equal(parseSpan("$1,247,893.00", "currency"), 124789300);
  assert.equal(parseSpan("(1,000.50)", "currency"), -100050);
  const big = parseSpan("$92,233,720,368,547,758.08", "currency");
  assert.equal(typeof big, "string");
  assert.equal(big, "9223372036854775808");
});

/* R2 — provenance vs selection */
test("GATING: a span value is deterministic ONLY when the location band is admissible", () => {
  const b = mk(), env = b.gamma({}, [AMOUNT_SLOT]);
  const lift = conf => b.alpha({ total: { file: "USSH004120", charOffset: OFFSET, length: 13 } }, env,
    { source, manifest: MANIFEST, confidences: conf === undefined ? {} : { total: conf } });

  const hi = lift(0.9).slots.total;
  assert.equal(hi.valueClass, "deterministic");

  const mid = lift(0.55).slots.total;
  assert.equal(mid.valueClass, "proposed", "a 55%-confident location cannot mint an anchor");
  assert.equal(mid.locationClassBand, "proposed");

  const low = lift(0.2);
  assert.equal(low.slots.total, undefined, "held means held — the value is dropped, not promoted");
  assert.match(low.unmapped[0].reason, /below the proposed floor/);

  const unstated = lift(undefined).slots.total;
  assert.equal(unstated.valueClass, "proposed", "absence of a confidence is not evidence of confidence");
  assert.equal(unstated.locationClassBand, "unstated");
});

/* ================= verification ================= */
test("lifted values are re-verified through UDM unconditionally", () => {
  const udm = new UDMRuntime({ constraints: { default: [{ name: "form_present", test: t => !!t.form }] } });
  const b = new Bridge({ udm, dimensions: DEFAULT_DIMENSIONS });
  const env = b.gamma({}, [FORM_SLOT]);
  assert.equal(b.alpha({ form: "PR-202" }, env, {}).verification.ok, true);
  assert.equal(b.alpha({ form: ABSTAIN }, env, {}).verification.ok, false);
});

/* ================= soundness: α(γ(S)) ⊆ S ∪ {ABSTAIN} ================= */
test("SOUNDNESS on set slots, including the lattice path and near-miss codes", () => {
  const jurPool = ["TX-RRC", "US-TX", "US", "US-NM", "NM-OCD", "US-TN", "us-tx", "TX-RRC ", ABSTAIN, "", "null"];
  const formPool = ["PR-202", "H-10", "W-10", "PR-10", "W-202", "H-2", "PR202", "pr 202", "X-10", ABSTAIN, "../../etc", "0"];
  let escapes = 0, accepted = 0, latticeProjections = 0, refusedGeneralisations = 0;

  for (const strictness of ["exact", "lattice", "fuzzy"]) {
    const b = mk({ strictness });
    for (let i = 0; i < 300; i++) {
      /* form slot — flat set */
      const formAdm = ["PR-202", "H-10", "W-10"].slice(0, 1 + (i % 3));
      const r1 = b.roundTripSound([{ name: "form", kind: "code", admissible: formAdm }],
        { form: formPool[Math.floor(Math.random() * formPool.length)] });
      if (!r1.sound) escapes++;
      if (r1.lifted?.slots.form) accepted++;

      /* jurisdiction slot — a real lattice, so specialised/generalisation-refused are reachable */
      const jurAdm = i % 2 ? ["US-TX"] : ["TX-RRC"];
      const r2 = b.roundTripSound(
        [{ name: "jur", kind: "code", dimension: "Jurisdiction", admissible: jurAdm }],
        { jur: jurPool[Math.floor(Math.random() * jurPool.length)] });
      /* lattice specialisation admits values BELOW an admissible one — that is inside
         the governed region by construction, so widen the membership test accordingly */
      if (r2.lifted?.slots.jur) {
        accepted++;
        const v = r2.lifted.slots.jur.value;
        const inSet = jurAdm.includes(v);
        const under = b.ancestors("Jurisdiction", v).some(a => jurAdm.includes(a));
        if (!inSet && !under) escapes++;
        if (r2.lifted.projections.some(p => p.how === "specialised")) latticeProjections++;
      }
      if (r2.lifted?.unmapped.some(u => u.reason === "generalisation-refused")) refusedGeneralisations++;
    }
  }
  assert.equal(escapes, 0, "no value may land outside the governed region");
  assert.ok(accepted > 100, "the bridge must still accept valid values");
  assert.ok(latticeProjections > 0, "the fuzz must actually exercise the specialisation path");
  assert.ok(refusedGeneralisations > 0, "the fuzz must actually exercise the generalisation refusal");
});

test("SOUNDNESS holds when the model returns structurally invalid output", () => {
  const b = mk();
  for (const bad of ["not json at all", "[]", "null", '{"form":{"nested":true}}', '{"other":"PR-202"}', '{"form":42}']) {
    const res = b.roundTripSound([FORM_SLOT], bad);
    assert.equal(res.sound, true, `must stay sound on: ${bad}`);
  }
});

/* ================= span fidelity fuzz =================
   Spans are outside the set-soundness property; their guarantee is fidelity:
   any surviving value must reproduce deterministically from its cited chars,
   and every citation must verify against the pinned document digest. */
test("SPAN FIDELITY: fuzzed offsets either refuse or reproduce from the cited characters", () => {
  const b = mk();
  const env = b.gamma({}, [
    { name: "amt", kind: "span", parse: "currency" },
    { name: "when", kind: "span", parse: "date" },
  ]);
  let survived = 0, refused = 0;
  for (let i = 0; i < 500; i++) {
    const charOffset = Math.floor(Math.random() * (DOC.length + 10)) - 3;   // includes negatives and past-end
    const length = Math.floor(Math.random() * 20) + 1;
    const slot = i % 2 ? "amt" : "when";
    const r = b.alpha({ [slot]: { file: "USSH004120", charOffset, length } }, env,
      { source, manifest: MANIFEST, confidences: { [slot]: 0.9 } });
    const v = r.slots[slot];
    if (!v) { refused++; continue; }
    survived++;
    const reparsed = parseSpan(v.evidence.chars, slot === "amt" ? "currency" : "date");
    assert.deepEqual(v.value, reparsed, "a surviving value must equal the deterministic parse of its own evidence");
    assert.equal(v.evidence.docSha256, MANIFEST.USSH004120);
    assert.equal(DOC.slice(v.evidence.charOffset, v.evidence.charOffset + v.evidence.length), v.evidence.chars,
      "the citation must reproduce the evidence from the document");
  }
  assert.ok(refused > 0, "most random spans must refuse");
});
