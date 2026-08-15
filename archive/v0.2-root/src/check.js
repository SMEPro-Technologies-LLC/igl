// SPDX-License-Identifier: Apache-2.0
/* IGL static checker — v0.2
   Everything that can be rejected before a model call is rejected here.
   Evaluation order is fixed (CRITIQUE D5): identity → boundary → intent →
   arguments → references. Errors accumulate; the caller sees all of them. */

import { IGLError } from "./lexer.js";
import { BUILTINS, INTENTS, TRACE_CHANNELS } from "./builtins.js";

const VALUE_TYPE = {
  String: "string", Number: "number", Code: "code",
  Symbol: "symbol", List: "list", Ref: "ref", Apply: "apply",
};

function typeOK(expected, actual) {
  if (expected === "any") return true;
  if (actual === "ref") return true;               // resolved at runtime, checked for existence separately
  if (expected === "code") return actual === "code" || actual === "symbol";
  if (expected === "symbol") return actual === "symbol" || actual === "code";
  return expected === actual;
}

export function check(ast, { intents = INTENTS, builtins = BUILTINS } = {}) {
  const errors = [];
  const add = (msg, node, code) => errors.push(new IGLError(msg, {
    line: node?.line ?? 0, col: node?.col ?? 0, phase: "check", code: code || "IGL_CHECK",
  }));

  const bound = new Map();       // output name -> statement index that produced it

  ast.statements.forEach((st, idx) => {
    /* 1. identity */
    if (!st.identity.actor.length) add("statement has no actor", st.identity, "IGL_NO_ACTOR");
    const role = st.identity.actor.length > 1 ? st.identity.actor[st.identity.actor.length - 1] : null;

    /* 2. boundary */
    const bkeys = new Set(st.identity.boundary.map(b => b.key));

    /* 3. intent authorisation */
    const spec = intents[st.intent.name];
    if (!spec) {
      add(`unknown intent ${st.intent.name}`, st.intent, "IGL_UNKNOWN_INTENT");
    } else {
      if (role && !spec.roles.includes(role))
        add(`role ${role} is not authorised for intent ${st.intent.name} (permitted: ${spec.roles.join(", ")})`,
            st.identity, "IGL_UNAUTHORISED");
      for (const need of spec.requiresBoundary || []) {
        if (!bkeys.has(need))
          add(`intent ${st.intent.name} requires boundary key ${need}`, st.identity, "IGL_BOUNDARY_INCOMPLETE");
      }
      for (const prm of st.intent.params) {
        const allowed = spec.params?.[prm.name];
        if (!allowed) { add(`intent ${st.intent.name} has no parameter ${prm.name}`, prm, "IGL_UNKNOWN_PARAM"); continue; }
        if (Array.isArray(allowed) && prm.value.kind === "Symbol" && !allowed.includes(prm.value.value))
          add(`${prm.name}=${prm.value.value} is not one of ${allowed.join(", ")}`, prm, "IGL_BAD_PARAM_VALUE");
      }
    }

    /* 4. compute steps and argument shapes */
    let sawTrace = false;
    st.compute.steps.forEach(step => {
      const key = `${step.subsystem}.${step.fn}`;
      const sg = builtins[key];
      if (!sg) { add(`unknown subsystem function ${key}`, step, "IGL_UNKNOWN_FN"); return; }
      if (key === "IOS.Trace") sawTrace = true;

      const named = new Map();
      const positional = [];
      for (const a of step.args) {
        if (a.kind === "Named") {
          if (named.has(a.name)) add(`duplicate argument ${a.name} in ${key}`, a, "IGL_DUP_ARG");
          named.set(a.name, a);
        } else positional.push(a);
      }

      // positional arguments bind to declared parameters in order (CRITIQUE A1)
      positional.forEach((a, i) => {
        const prm = sg.params[i];
        if (!prm) { add(`${key} takes ${sg.params.length} positional argument(s), got ${positional.length}`, a, "IGL_ARITY"); return; }
        if (named.has(prm.name)) add(`${prm.name} supplied both positionally and by name in ${key}`, a, "IGL_DUP_ARG");
        else named.set(prm.name, { ...a, name: prm.name });
      });

      for (const prm of sg.params) {
        const got = named.get(prm.name);
        if (!got) {
          if (prm.required) add(`${key} requires ${prm.name}`, step, "IGL_MISSING_ARG");
          continue;
        }
        const actual = VALUE_TYPE[got.value.kind];
        if (actual !== "apply" && !typeOK(prm.type, actual))
          add(`${key} argument ${prm.name} expects ${prm.type}, got ${actual}`, got, "IGL_ARG_TYPE");
      }
      for (const [name] of named) {
        if (!sg.params.some(prm => prm.name === name))
          add(`${key} has no argument ${name}`, named.get(name), "IGL_UNKNOWN_ARG");
      }

      // model pinning is mandatory for probabilistic calls (CRITIQUE B3)
      if (sg.requiresModel && !named.has("Model"))
        add(`${key} must pin a model — an unpinned inference cannot be replayed or audited`, step, "IGL_UNPINNED_MODEL");

      // trace channels must be known
      if (key === "IOS.Trace") {
        const ch = named.get("Channels");
        if (ch && ch.value.kind === "List") {
          for (const item of ch.value.items) {
            const nm = item.value;
            if (item.kind !== "Symbol" || !TRACE_CHANNELS.has(nm))
              add(`unknown trace channel ${nm ?? item.kind}`, item, "IGL_UNKNOWN_CHANNEL");
          }
        }
      }
    });

    /* 5. fail-closed on trace is a static property, not a runtime hope */
    if (!sawTrace)
      add("statement has no IOS.Trace step — untraced computation is not admissible", st.compute, "IGL_UNTRACED");

    /* 6. output typing against the intent's declared outputs (CRITIQUE B4) */
    if (spec) {
      for (const item of st.output.items) {
        if (!spec.outputs[item.name])
          add(`intent ${st.intent.name} does not declare output ${item.name} (declares: ${Object.keys(spec.outputs).join(", ")})`,
              item, "IGL_UNDECLARED_OUTPUT");
      }
      if (spec.requiresAttestation) {
        const hasAttest = st.compute.steps.some(s => s.subsystem === "IOS" && s.fn === "Attest");
        if (!hasAttest)
          add(`intent ${st.intent.name} requires human attestation — add IOS.Attest(Signer=..., Role=...)`,
              st.intent, "IGL_NO_ATTESTATION");
      }
    }

    /* 7. references must resolve to an output bound by an earlier statement (CRITIQUE B2) */
    const walkRefs = (node, fn) => {
      if (!node || typeof node !== "object") return;
      if (node.kind === "Ref") fn(node);
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) v.forEach(x => walkRefs(x, fn));
        else if (v && typeof v === "object") walkRefs(v, fn);
      }
    };
    walkRefs(st.compute, ref => {
      if (!bound.has(ref.name))
        add(`@${ref.name} is not produced by any earlier statement`, ref, "IGL_UNBOUND_REF");
      else if (bound.get(ref.name) >= idx)
        add(`@${ref.name} is referenced before it is produced`, ref, "IGL_FORWARD_REF");
    });
    walkRefs(st.context, ref => {
      if (!bound.has(ref.name)) add(`@${ref.name} is not produced by any earlier statement`, ref, "IGL_UNBOUND_REF");
    });

    for (const item of st.output.items) bound.set(item.name, idx);
  });

  return errors;
}
