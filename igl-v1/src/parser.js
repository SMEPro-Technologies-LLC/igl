/* IGL v1.0 reference runtime - parser
   Recursive-descent parser for Schedule A. Where Schedule A and the Schedule C
   sample programs disagree (the samples are normative under Section 2.03), the
   parser follows the samples: BOUNDARY and CONSTRAINT declarations both live in
   the CONSTRAINTS block, and LET may bind the result of a CAPTURE_TRACE/BIND/
   CAPTURE form that also carries its own INTO/AS name. */

import { lex, IGLError } from "./lexer.js";

export function parse(src) {
  const toks = lex(src);
  let p = 0;
  const peek = (k = 0) => toks[p + k];
  const at = (type, value) => peek().type === type && (value === undefined || peek().value === value);
  const atKw = v => peek().type === "KEYWORD" && peek().value === v;
  const next = () => toks[p++];
  const err = (m, code) => { const t = peek(); throw new IGLError(m, { line: t.line, col: t.col, phase: "parse", code: code || "PARSE_ERROR" }); };
  function expect(type, value) {
    if (!at(type, value)) err(`expected ${value ?? type}, found ${JSON.stringify(peek().value ?? peek().type)}`, "UNEXPECTED_TOKEN");
    return next();
  }
  function expectKw(v) {
    if (!atKw(v)) err(`expected keyword ${v}, found ${JSON.stringify(peek().value ?? peek().type)}`, "UNEXPECTED_TOKEN");
    return next();
  }
  const node = (o) => ({ ...o, line: peek().line, col: peek().col });

  /* ---------- program ---------- */
  function parseProgram() {
    expectKw("IGL");
    const version = at("VERSION") ? next().value : err("expected version literal after IGL", "NO_VERSION");
    expectKw("PROGRAM");
    const name = expect("STRING").value;
    let session = null;
    if (atKw("SESSION")) { next(); session = expect("STRING").value; }
    expect("SEMI");
    const identities = parseIdentityBlock();
    const constraints = parseConstraintsBlock();
    const body = parseBodyBlock();
    const receipt = parseReceiptBlock();
    expect("EOF");
    return { kind: "Program", version, name, session, identities, constraints, body, receipt };
  }

  /* ---------- IDENTITY { ... } ---------- */
  function parseIdentityBlock() {
    expectKw("IDENTITY"); expect("LBRACE");
    const out = [];
    while (!at("RBRACE")) {
      expectKw("DECLARE"); expectKw("IDENTITY");
      const name = expect("IDENT").value;
      expectKw("AS");
      const operand = parseRecord("IDENTITY_OPERAND");
      expect("SEMI");
      out.push({ kind: "IdentityDecl", name, operand });
    }
    expect("RBRACE");
    if (!out.length) err("IDENTITY block must declare at least one identity", "EMPTY_IDENTITY");
    return out;
  }

  /* ---------- CONSTRAINTS { ... } ---------- */
  function parseConstraintsBlock() {
    expectKw("CONSTRAINTS"); expect("LBRACE");
    const boundaries = [], matrices = [];
    while (!at("RBRACE")) {
      expectKw("DECLARE");
      if (atKw("BOUNDARY")) {
        next(); const name = expect("IDENT").value; expectKw("AS");
        const rec = parseRecord("BOUNDARY_TENSOR"); expect("SEMI");
        boundaries.push({ kind: "BoundaryDecl", name, tensor: rec });
      } else if (atKw("CONSTRAINT")) {
        next(); const name = expect("IDENT").value; expectKw("AS");
        const rec = parseRecord("CONSTRAINT_MATRIX"); expect("SEMI");
        matrices.push({ kind: "ConstraintDecl", name, matrix: rec });
      } else err("CONSTRAINTS block expects DECLARE BOUNDARY or DECLARE CONSTRAINT", "BAD_CONSTRAINT_DECL");
    }
    expect("RBRACE");
    return { boundaries, matrices };
  }

  /* ---------- record literals: IDENTITY_OPERAND / BOUNDARY_TENSOR / CONSTRAINT_MATRIX ---------- */
  function parseRecord(kwName) {
    expectKw(kwName); expect("LBRACE");
    const fields = {};
    while (!at("RBRACE")) {
      const key = expect("IDENT").value;
      expect("COLON");
      fields[key] = parseRecordValue();
      if (at("COMMA")) next();
    }
    expect("RBRACE");
    return { kind: "Record", type: kwName, fields };
  }

  function parseRecordValue() {
    // array
    if (at("LBRACK")) {
      next(); const items = [];
      while (!at("RBRACK")) { items.push(parseRecordValue()); if (at("COMMA")) next(); }
      expect("RBRACK");
      return { kind: "Array", items };
    }
    // DELEGATE TO <ref>
    if (atKw("DELEGATE")) { next(); expectKw("TO"); const ref = parseScalar(); return { kind: "Delegate", to: ref }; }
    return parseScalar();
  }

  function parseScalar() {
    const t = peek();
    if (t.type === "STRING") { next(); return { kind: "Str", value: t.value }; }
    if (t.type === "FLOAT" || t.type === "INT") { next(); return { kind: "Num", value: t.value }; }
    if (t.type === "VERSION") { next(); return { kind: "Str", value: t.value }; }
    if (t.type === "KEYWORD") { next(); return { kind: "Sym", value: t.value }; }
    if (t.type === "IDENT") { next(); return { kind: "Ref", name: t.value }; }
    err(`unexpected value token ${JSON.stringify(t.value ?? t.type)}`, "BAD_VALUE");
  }

  /* ---------- BEGIN ... END ---------- */
  function parseBodyBlock() {
    expectKw("BEGIN");
    const stmts = [];
    while (!atKw("END")) {
      if (at("EOF")) err("unterminated BEGIN block", "UNTERMINATED_BODY");
      stmts.push(parseStatement());
    }
    expectKw("END");
    return stmts;
  }

  function parseBlock() {
    expect("LBRACE");
    const stmts = [];
    while (!at("RBRACE")) {
      if (at("EOF")) err("unterminated block", "UNTERMINATED_BLOCK");
      stmts.push(parseStatement());
    }
    expect("RBRACE");
    return stmts;
  }

  function parseStatement() {
    if (atKw("LET")) {
      next(); const name = expect("IDENT").value; expect("EQUALS");
      const expr = parseExpr(); expect("SEMI");
      return { kind: "Let", name, expr };
    }
    if (atKw("INJECT")) { const e = parseInject(); expect("SEMI"); return e; }
    if (atKw("RECURSE")) return parseRecurse();
    if (atKw("IF_AUTHORITY")) return parseIfAuthority();
    if (atKw("WHEN_BOUNDARY")) return parseWhenBoundary();
    if (atKw("UNLESS_EXCEPTION")) return parseUnlessException();
    // bare expression statement (e.g. a standalone CAPTURE_TRACE / BIND)
    const expr = parseExpr(); expect("SEMI");
    return { kind: "ExprStmt", expr };
  }

  function parseInject() {
    expectKw("INJECT"); expect("LPAREN");
    const matrix = expect("IDENT").value; expect("COMMA");
    const context = parseContext(); expect("RPAREN");
    return { kind: "Inject", matrix, context };
  }

  function parseContext() {
    // context_expr ::= identifier | inference_context_expr ; treated as a named handle
    const nameTok = expect("IDENT");
    return { kind: "Ctx", name: nameTok.value };
  }

  function parseRecurse() {
    expectKw("RECURSE"); expect("LPAREN");
    const out = parseExpr(); expect("COMMA");
    const context = parseContext(); expect("RPAREN");
    expectKw("MAX_DEPTH"); const maxDepth = expect("INT").value;
    expectKw("CARRYING"); const carrying = parseIdentRef();
    expectKw("AS"); const as = expect("IDENT").value; expect("SEMI");
    return { kind: "Recurse", out, context, maxDepth, carrying, as };
  }

  function parseIfAuthority() {
    expectKw("IF_AUTHORITY"); expect("LPAREN");
    const identity = parseIdentRef(); expect("COMMA");
    const op = expect("KEYWORD").value; expect("COMMA");
    const value = parseNumber(); expect("RPAREN");
    expectKw("THEN"); const thenB = parseBlock();
    let elseB = null; if (atKw("ELSE")) { next(); elseB = parseBlock(); }
    return { kind: "IfAuthority", identity, op, value, thenB, elseB };
  }

  function parseWhenBoundary() {
    expectKw("WHEN_BOUNDARY"); expect("LPAREN");
    const boundary = expect("IDENT").value; expect("COMMA");
    const constraint = expect("IDENT").value; expect("RPAREN");
    expectKw("WITHIN"); const withinB = parseBlock();
    let outsideB = null; if (atKw("OUTSIDE")) { next(); outsideB = parseBlock(); }
    return { kind: "WhenBoundary", boundary, constraint, withinB, outsideB };
  }

  function parseUnlessException() {
    expectKw("UNLESS_EXCEPTION"); expect("LPAREN");
    const handle = expect("STRING").value; expect("COMMA");
    const identity = parseIdentRef(); expect("RPAREN");
    const block = parseBlock();
    let elseB = null; if (atKw("ELSE")) { next(); elseB = parseBlock(); }
    return { kind: "UnlessException", handle, identity, block, elseB };
  }

  function parseIdentRef() {
    // an identity reference is either a bare identifier (declared name) or a uri string
    if (at("STRING")) return { kind: "IdUri", value: next().value };
    return { kind: "IdName", name: expect("IDENT").value };
  }
  function parseNumber() { const t = peek(); if (t.type === "FLOAT" || t.type === "INT") { next(); return t.value; } err("expected number", "EXPECTED_NUMBER"); }

  /* ---------- expressions ---------- */
  function parseExpr() {
    const t = peek();
    if (t.type === "KEYWORD") {
      switch (t.value) {
        case "FUSE": return parseFuse();
        case "AI_INFER": return parseAiInfer();
        case "CONSTRAIN": return parseBinCall("Constrain");
        case "PROJECT": return parseBinCall("Project");
        case "VERIFY": return parseBinCall("Verify");
        case "CAPTURE_TRACE": return parseCaptureTrace();
        case "BIND": return parseBindExpr();
        case "CAPTURE": return parseCaptureExpr();
        case "COMPLIANT": case "VIOLATION": case "EXCEPTION_APPLIED": next(); return { kind: "Sym", value: t.value };
        default: err(`unexpected keyword ${t.value} in expression`, "BAD_EXPR");
      }
    }
    if (t.type === "STRING") { next(); return { kind: "Str", value: t.value }; }
    if (t.type === "FLOAT" || t.type === "INT") { next(); return { kind: "Num", value: t.value }; }
    if (t.type === "IDENT") { next(); return { kind: "Ref", name: t.value }; }
    err(`unexpected token ${JSON.stringify(t.value ?? t.type)} in expression`, "BAD_EXPR");
  }

  function parseFuse() {
    expectKw("FUSE"); expect("LPAREN");
    const v = parseExpr(); expect("COMMA");
    const m = parseExpr(); expect("RPAREN");
    let under = null; if (atKw("UNDER")) { next(); under = parseIdentRef(); }
    return { kind: "Fuse", v, m, under };
  }
  function parseAiInfer() {
    expectKw("AI_INFER"); expect("LPAREN");
    const prompt = parseExpr();
    let context = null; if (at("COMMA")) { next(); context = parseContext(); }
    expect("RPAREN");
    return { kind: "AiInfer", prompt, context };
  }
  function parseBinCall(kind) {
    next(); expect("LPAREN");
    const a = parseExpr(); expect("COMMA");
    const b = parseExpr(); expect("RPAREN");
    return { kind, a, b };
  }
  function parseCaptureTrace() {
    expectKw("CAPTURE_TRACE"); expect("LPAREN");
    const arg = parseExpr(); expect("RPAREN");
    expectKw("INTO"); const into = expect("IDENT").value;
    return { kind: "CaptureTrace", arg, into };
  }
  function parseBindExpr() {
    expectKw("BIND"); expect("LPAREN");
    const identity = parseIdentRef(); expect("COMMA");
    const trace = expect("IDENT").value; expect("RPAREN");
    expectKw("AS"); const as = expect("IDENT").value;
    return { kind: "Bind", identity, trace, as };
  }
  function parseCaptureExpr() {
    expectKw("CAPTURE"); expect("LPAREN");
    const turn = expect("IDENT").value; expect("RPAREN");
    expectKw("AS"); const as = expect("IDENT").value;
    let outcome = null; if (atKw("WITH_OUTCOME")) { next(); outcome = expect("KEYWORD").value; }
    return { kind: "Capture", turn, as, outcome };
  }

  /* ---------- RECEIPT { CAPTURE(...) AS ... } ---------- */
  function parseReceiptBlock() {
    expectKw("RECEIPT"); expect("LBRACE");
    const cap = parseCaptureExpr(); expect("SEMI");
    expect("RBRACE");
    return cap;
  }

  return parseProgram();
}
