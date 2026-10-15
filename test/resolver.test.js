import test from "node:test";
import assert from "node:assert/strict";
import { resolveDescription, slugify, actorToken } from "../provision/resolver.mjs";

test("resolver: a first-person description names the person and resolves to a FOOTPRINT graph", () => {
  const r = resolveDescription("My name is Maria Santos. I am a compliance lead at Rio Diablo Operating in Texas. I prepare regulatory filings for an oil and gas operator.");
  assert.equal(r.name, "Maria Santos");
  assert.equal(r.kind, "FOOTPRINT");
  assert.equal(r.actor, "Maria_Santos");
  assert.equal(r.attributes.state, "TX");
  assert.equal(r.attributes.industry, "oil-and-gas");
  assert.ok(r.roleActions && r.roleActions.granted.length > 0);
});

test("resolver: a legal entity suffix forces a BOUNDARY graph and keeps the entity name", () => {
  const r = resolveDescription("Rio Diablo Operating, LLC is a natural gas operator in Texas with gathering stations.");
  assert.equal(r.kind, "BOUNDARY");
  assert.match(r.name, /^Rio Diablo Operating/);
  assert.equal(r.attributes.industry, "oil-and-gas");
  assert.equal(r.industryDetail.agency, "TX-RRC");
  assert.equal(r.roleActions, null);
});

test("resolver: resolution is deterministic and tokens are stable", () => {
  const text = "I am a forensic analyst in Colorado handling incident response.";
  const a = resolveDescription(text), b = resolveDescription(text);
  assert.deepEqual(a, b);
  assert.equal(a.attributes.state, "CO");
  assert.equal(a.attributes.role, "dfir-coordinator");
  assert.equal(slugify("Maria Santos"), "maria-santos");
  assert.equal(actorToken("Rio Diablo Operating, LLC"), "Rio_Diablo_Operating_LLC");
});
