// SPDX-License-Identifier: Apache-2.0
/* IGL parser — v0.2
   Builds the AST described in SPEC.md §6. Every node carries source position so
   that a governed error can point at the clause that caused it. */

import { lex, IGLError } from "./lexer.js";

export function parse(src) {
  const toks = lex(src);
  let p = 0;

  const peek = (k = 0) => toks[Math.min(p + k, toks.length - 1)];
  const at = (type, value) => peek().type === type && (value === undefined || peek().value === value);
  const err = (m, code = "IGL_PARSE", t = peek()) => {
    throw new IGLError(m, { line: t.line, col: t.col, phase: "parse", code });
  };
  const eat = (type, value, what) => {
    if (!at(type, value)) err(`expected ${what || value || type}, found ${peek().type === "EOF" ? "end of input" : JSON.stringify(peek().value)}`);
    return toks[p++];
  };
  const opt = (type, value) => (at(type, value) ? toks[p++] : null);

  const pos = t => ({ line: t.line, col: t.col });

  /* ---------- values ---------- */
  function parseValue() {
    const t = peek();
    if (t.type === "STRING") { p++; return { kind: "String", value: t.value, ...pos(t) }; }
    if (t.type === "NUMBER") { p++; return { kind: "Number", value: t.value, ...pos(t) }; }
    if (t.type === "CODE")   { p++; return { kind: "Code", value: t.value, ...pos(t) }; }
    if (t.type === "AT") {                              // @name — output reference (CRITIQUE B2/D1)
      p++;
      const id = eat("IDENT", undefined, "an output name after @");
      return { kind: "Ref", name: id.value, ...pos(t) };
    }
    if (t.type === "LBRACK") {                          // list
      p++;
      const items = [];
      if (!at("RBRACK")) {
        do { items.push(parseValue()); } while (opt("COMMA"));
      }
      eat("RBRACK", undefined, "] to close a list");
      return { kind: "List", items, ...pos(t) };
    }
    if (t.type === "IDENT" || t.type === "KEYWORD") {
      // Symbol, or a nested call used as a value (e.g. Recent(20))
      p++;
      if (at("LPAREN")) {
        const args = parseArgs();
        return { kind: "Apply", name: t.value, args, ...pos(t) };
      }
      return { kind: "Symbol", value: t.value, ...pos(t) };
    }
    err("expected a value");
  }

  /* ---------- argument lists ----------
     Positional arguments are admitted (CRITIQUE A1) but may not follow named ones. */
  function parseArgs() {
    eat("LPAREN", undefined, "(");
    const args = [];
    let seenNamed = false;
    if (!at("RPAREN")) {
      do {
        const t = peek();
        if ((t.type === "IDENT") && peek(1).type === "EQ") {
          p += 2;
          const value = parseValue();
          args.push({ kind: "Named", name: t.value, value, ...pos(t) });
          seenNamed = true;
        } else {
          const value = parseValue();
          if (seenNamed) err("positional argument after a named argument", "IGL_ARG_ORDER", t);
          args.push({ kind: "Positional", value, ...pos(t) });
        }
      } while (opt("COMMA"));
    }
    eat("RPAREN", undefined, ") to close the argument list");
    return args;
  }

  /* ---------- ID[Actor | Boundary] ---------- */
  function parseIdentity() {
    const start = eat("KEYWORD", "ID", "ID");
    eat("LBRACK", undefined, "[ after ID");

    // ActorSpec ::= Identifier (":" Identifier)*
    const actor = [];
    do {
      const t = peek();
      if (t.type !== "IDENT" && t.type !== "CODE") err("expected an actor name");
      p++; actor.push(t.value);
    } while (opt("COLON"));

    const boundary = [];
    if (opt("PIPE")) {
      do {
        const k = peek();
        if (k.type !== "IDENT") err("expected a boundary key");
        p++;
        eat("COLON", undefined, ": after a boundary key");
        const v = peek();
        if (!["IDENT", "CODE", "NUMBER", "STRING"].includes(v.type)) err("expected a boundary value");
        p++;
        boundary.push({ key: k.value, value: v.value, valueType: v.type, ...pos(k) });
      } while (opt("COMMA"));
    }
    eat("RBRACK", undefined, "] to close the identity block");
    if (!boundary.length) err("identity block declares no boundary — governance is not optional", "IGL_NO_BOUNDARY", start);
    return { kind: "Identity", actor, boundary, ...pos(start) };
  }

  /* ---------- Intent[Name, k=v ...] ---------- */
  function parseIntent() {
    const start = eat("KEYWORD", "Intent", "Intent");
    eat("LBRACK", undefined, "[ after Intent");
    const nameTok = peek();
    if (nameTok.type !== "IDENT" && nameTok.type !== "CODE") err("expected an intent name");
    p++;
    const params = [];
    while (opt("COMMA")) {
      const k = eat("IDENT", undefined, "a parameter name");
      eat("EQ", undefined, "= after a parameter name");
      params.push({ name: k.value, value: parseValue(), ...pos(k) });
    }
    eat("RBRACK", undefined, "] to close the intent block");
    return { kind: "Intent", name: nameTok.value, params, ...pos(start) };
  }

  /* ---------- Compute[ subsystem.fn(...), ... ] ---------- */
  const SUBSYSTEMS = new Set(["UDM", "AI", "IOS"]);
  function parseCompute() {
    const start = eat("KEYWORD", "Compute", "Compute");
    eat("LBRACK", undefined, "[ after Compute");
    const steps = [];
    if (!at("RBRACK")) {
      do {
        const sysTok = peek();
        if (sysTok.type !== "IDENT" || !SUBSYSTEMS.has(sysTok.value))
          err(`expected UDM, AI or IOS at the start of a compute step`, "IGL_UNKNOWN_SUBSYSTEM", sysTok);
        p++;
        eat("DOT", undefined, ". after a subsystem name");
        const fnTok = peek();
        if (fnTok.type !== "IDENT") err("expected a subsystem function name");
        p++;
        const args = at("LPAREN") ? parseArgs() : [];
        steps.push({ kind: "Call", subsystem: sysTok.value, fn: fnTok.value, args, ...pos(sysTok) });
      } while (opt("COMMA"));
    }
    eat("RBRACK", undefined, "] to close the compute block");
    if (!steps.length) err("compute block is empty", "IGL_EMPTY_COMPUTE", start);
    return { kind: "Compute", steps, ...pos(start) };
  }

  /* ---------- Context[...] — trace selection, explicit and traced (CRITIQUE C2) ---------- */
  function parseContext() {
    const start = eat("KEYWORD", "Context", "Context");
    eat("LBRACK", undefined, "[ after Context");
    const items = [];
    if (!at("RBRACK")) {
      do {
        const t = peek();
        if (t.type === "IDENT" && peek(1).type === "EQ") {
          p += 2;
          items.push({ kind: "Named", name: t.value, value: parseValue(), ...pos(t) });
        } else {
          items.push({ kind: "Positional", value: parseValue(), ...pos(t) });
        }
      } while (opt("COMMA"));
    }
    eat("RBRACK", undefined, "] to close the context block");
    return { kind: "Context", items, ...pos(start) };
  }

  /* ---------- Output[Name, Name=Value, ...] ---------- */
  function parseOutput() {
    const start = eat("KEYWORD", "Output", "Output");
    eat("LBRACK", undefined, "[ after Output");
    const items = [];
    if (!at("RBRACK")) {
      do {
        const t = peek();
        if (t.type !== "IDENT" && t.type !== "CODE") err("expected an output name");
        p++;
        let value = null;
        if (opt("EQ")) value = parseValue();
        items.push({ name: t.value, value, ...pos(t) });
      } while (opt("COMMA"));
    }
    eat("RBRACK", undefined, "] to close the output block");
    if (!items.length) err("output block is empty", "IGL_EMPTY_OUTPUT", start);
    return { kind: "Output", items, ...pos(start) };
  }

  /* ---------- OnFail[Handler(...), ...] (CRITIQUE B1) ---------- */
  const HANDLERS = new Set(["Remediate", "Halt", "Fallback", "Retry"]);
  function parseOnFail() {
    const start = eat("KEYWORD", "OnFail", "OnFail");
    eat("LBRACK", undefined, "[ after OnFail");
    const handlers = [];
    if (!at("RBRACK")) {
      do {
        const t = peek();
        if (t.type !== "IDENT" || !HANDLERS.has(t.value))
          err(`unknown failure handler — expected one of ${[...HANDLERS].join(", ")}`, "IGL_UNKNOWN_HANDLER", t);
        p++;
        const args = at("LPAREN") ? parseArgs() : [];
        handlers.push({ name: t.value, args, ...pos(t) });
      } while (opt("COMMA"));
    }
    eat("RBRACK", undefined, "] to close the OnFail block");
    return { kind: "OnFail", handlers, ...pos(start) };
  }

  /* ---------- statement ---------- */
  function parseStatement() {
    const identity = parseIdentity();
    eat("COLONCOLON", undefined, ":: after the identity block");
    const intent = parseIntent();
    eat("ARROW_INTENT", undefined, "=> after the intent block");
    const context = at("KEYWORD", "Context") ? parseContext() : null;
    if (context) eat("COMMA", undefined, ", after the context block");
    const compute = parseCompute();
    eat("ARROW_OUT", undefined, "-> after the compute block");
    const output = parseOutput();
    const onFail = at("KEYWORD", "OnFail") ? parseOnFail() : null;
    opt("SEMI");                                   // terminator optional (CRITIQUE A3)
    return {
      kind: "Statement",
      identity, intent, context, compute, output, onFail,
      line: identity.line, col: identity.col,
    };
  }

  /* ---------- program ---------- */
  let version = null;
  if (at("PRAGMA")) version = toks[p++].value;
  const statements = [];
  while (!at("EOF")) statements.push(parseStatement());
  return { kind: "Program", version, statements };
}
