# IGL Closeout: Identity Governed Logic and the Governed Intelligence Architecture

Date: 2026-08-13.

This closeout is written in two registers on purpose. The first is what is running
and proven today, in present tense, safe to say in front of a regulator or a buyer.
The second is the target architecture, the Governed Intelligence Architecture,
which holds the pieces that are designed and partly demonstrated but not yet
production. Keeping the two apart is what lets the proven part carry weight.

## The thesis

IGL is a coding language for artificial intelligence. Governance is not a filter
bolted on after a model speaks. It is a numeric computation the system performs and
fuses with the model's own numeric computation, so that by the time a token is
chosen the space it is chosen from has already been restricted by the deterministic
limits of the governing law. Determination happens first. The model is downstream
of it. Because the governance lives in the same numeric space as the model's
distribution, it steers the reasoning rather than censoring the output.

## Register one: running and proven today

Identity first, fail closed. Every IGL statement resolves an identity before it
computes: the actor by URI, the boundary tensor, the authority scalar in a
normalized range, and the declared delegations and exceptions. If the resolution
fails, the gate is shut before a single token is generated. Authority resolves
through the graph, with structural composition resolving by MIN-intersection so
that no arrangement of edges can raise authority,
and delegation running at the delegated target's declared level, clamped so a
delegation edge can never borrow an inherited super-authority. That clamp closed a
real escalation gap.

The governing law as numbers. The Universal Decoding Matrix is served live from
`udm.igl.dev` as a graded constraint per jurisdiction and agency: a weight per path
that gives support restriction, a graded ceiling per path that is the boundary
check, and a service-computed digest that names that exact matrix. The runtime
fetches it, and the receipt binds to the digest the service published.

FUSE, and now FUSE inside the decode loop. The core operation is the elementwise
product of a distribution with the governance weight vector, renormalized, so a
zero weight forces zero mass and every surviving path is checked against its
ceiling. As of this build that runs in two places. It runs on a governed turn, and
it runs inside a real token-by-token decode loop in `src/decoder.js`, applied at
every step to the model's own next-token distribution, so a prohibited token is
zeroed in the distribution the sampler draws from and can never be emitted at any
step. The decoder captures the real per-token cognitive trace: the raw and governed
distributions, the entropy of each, and the tokens forced to zero. It seals that
trace into a hash chain and signs it, and `verifyDecode` recomputes the whole decode
from the record alone. A committed sample sits at `artifacts/decode-trace.sample.json`,
where a reference model that strongly wants a forbidden token is held to emitting
only permitted ones across every step. The model enters through one seam,
`logitsFn`, and `governanceLogitsProcessor` is the drop-in for an external decoder;
`examples/govern-transformers.mjs` shows the wiring against a real transformers.js
model.

Provable, and independently. Every governed turn and every decode session produces
an Ed25519 receipt over a canonical hashed record. A party holding only the public
key verifies the signature and recomputes the FUSE or the decode without trusting
the host. A hard boundary crossed during a decode halts it and seals the partial
trace rather than emitting.

Live and bound to real governance. The execution surface is deployed as the
`igl-api` Cloudflare Worker. A live request against US-TX RRC returned a receipt
bound to the real service digest `1252a4e5...`, with the personally identifying
path forced to zero mass, and that receipt verified by signature and hash chain
from a separate machine. A scheduled job re-proves the binding every day.

For any engine. The model is a labelled seam, so the same governance applies
identically to whatever produced the distribution. Proven identical across vendor
adapters at the seam.

The reference runtime carries 108 checks across ten suites, green in CI, spanning
conformance, adversarial tamper and fail-closed cases, the vendor seam, the live
service binding, the authority policy, the deployed surface end to end, and the
governed decoder.

## Register two: the target Governed Intelligence Architecture

These are the pieces from the full synthesis that are designed, and in some cases
partly demonstrated, but not yet production. They are the roadmap, not the record.

The Semantic Crosswalk Tensor. Today the decoder governs over a weight vector
aligned to a vocabulary, and the deployed path governs over reasoning paths. The
missing bridge is the precomputed tensor that maps the Universal Decoding Matrix's
qualitative categories, GDPR, HIPAA, financial thresholds, onto the latent semantic
dimensions of a specific model and projects them down to that model's token
vocabulary as the weight vector. Building and validating that crosswalk per model is
what turns "govern this vocabulary" into "govern this law on this model."

Live integration with a production model's decoder. The in-decode mechanism is
proven with a reference forward pass and wired for transformers.js. Running it
inside a specific large or proprietary model, capturing that model's real attention
and logprob footprint as the cognitive trace, and enforcing the boundary check on
genuinely generated output, is the next integration.

Live multi-vendor filing. The WellSite program proves the governed grammar and runs
end to end, and the governance is proven identical across vendor adapters at the
seam. Running the actual filing live across Llama, Gemini, OpenAI, and Claude, each
governed by the one program, is the demonstration that remains.

Operational hardening. Move the signing seed to a managed key service with rotation
and revocation and publish the public key to a directory. Independent review of the
cryptography and the runtime. Scale and soak testing at production trace volumes.
The evidentiary position by counsel per jurisdiction. A bounded production pilot
with a real filing and a real user. Reconciling the public materials to the model
that is actually live.

## The close

The part that had to be true for IGL to mean anything is true and running.
Governance is expressed as a language, executed for real, fused with the model's own
computation inside the decode loop, signed, and checkable by anyone, against a live
governance source. What remains is named honestly in register two and is the work of
turning a proven architecture into an operated product, not the work of proving it
can exist.
