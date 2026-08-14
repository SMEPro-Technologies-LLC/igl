# Licensing decision — required before public release

Status: OPEN. The package is `UNLICENSED`, which forbids all reuse. A public
global release without a license grants nobody the right to run, study, or
adopt the code — the opposite of a standards play. This memo frames the choice;
the decision belongs to SMEPro Technologies LLC, ideally with counsel.

## The strategic question

Is IGL a **standard** (maximize adoption, monetize the service, packs, and
gateway) or a **product** (protect the runtime itself)? The packaging model
(assessment §4) and the GIA category thesis both lean standard: the moat is
udm.igl.dev, the constraint-pack registry, the receipts infrastructure, and the
brand — not the reference interpreter's source.

## Option A — Apache-2.0 (recommended for a standards play)

- Maximizes adoption and vendor uptake; includes an express patent grant,
  which enterprises and model vendors will require before embedding.
- Keeps trademark rights ("IGL", "Governed Intelligence Architecture", the
  v ⊙ w mark) fully reserved — control the name and the conformance claim,
  not the copy. Pair with a TRADEMARKS.md and a conformance policy
  ("may not be described as IGL unless it passes Schedule C + the adversarial
  suite" — SPEC §10 already states this).
- Revenue: hosted UDM service, signed constraint packs, enterprise gateway,
  certification.

## Option B — Business Source License 1.1 (source-available)

- Source visible, production use restricted (e.g., "no commercial governed-
  execution service") until a change date (2–4 years), then converts to an
  open license automatically.
- Protects against a hyperscaler shipping the runtime as a service before the
  company establishes the category — at the cost of slower standards adoption
  and friction with the AI Action Plan / open-ecosystem positioning.

## Option C — dual license (AGPL-3.0 + commercial)

- Strong copyleft repels closed embedding; vendors buy the commercial license.
  Highest control, highest sales friction; uncommon for standards substrates.

## Recommendation

Apache-2.0 for `igl-v1` (the reference implementation and spec conformance
suite), trademarks reserved, with the UDM service, constraint packs, and any
production gateway remaining proprietary services. This mirrors how successful
standards captured their categories: open reference, controlled mark,
monetized infrastructure.

## Mechanics once decided

1. Add `LICENSE` at repo root (and `igl-v1/LICENSE` if licensing differs by tree).
2. Set `"license"` in `package.json` (e.g., `"Apache-2.0"`).
3. Add `TRADEMARKS.md` reserving the marks and the conformance claim.
4. Add copyright headers or a `NOTICE` file naming SMEPro Technologies LLC.
5. Re-verify `npm test` and tag the release.
