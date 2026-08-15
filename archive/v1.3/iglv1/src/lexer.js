/* IGL v1.0 reference runtime - lexer
   Tokenises the block-structured grammar of Schedule A.
   Comments run from "--" to end of line. Strings are double-quoted. */

export class IGLError extends Error {
  constructor(message, { line = 0, col = 0, phase = "lex", code = "LEX_ERROR" } = {}) {
    super(message);
    this.name = "IGLError";
    this.line = line; this.col = col; this.phase = phase; this.code = code;
  }
  toString() { return `${this.phase}:${this.code} ${this.message} (line ${this.line}, col ${this.col})`; }
}

/* Reserved words and operator names that must lex as keywords, not identifiers. */
export const KEYWORDS = new Set([
  "IGL", "PROGRAM", "SESSION",
  "IDENTITY", "CONSTRAINTS", "BEGIN", "END", "RECEIPT",
  "DECLARE", "AS", "IDENTITY_OPERAND", "BOUNDARY", "BOUNDARY_TENSOR",
  "CONSTRAINT", "CONSTRAINT_MATRIX",
  "INHERIT", "ISOLATE", "DELEGATE", "TO",
  "HARD", "SOFT",
  "LET", "INJECT", "FUSE", "UNDER", "AI_INFER",
  "CONSTRAIN", "CAPTURE_TRACE", "INTO", "BIND", "CAPTURE", "WITH_OUTCOME",
  "VERIFY", "PROJECT", "RECURSE", "MAX_DEPTH", "CARRYING",
  "IF_AUTHORITY", "THEN", "ELSE", "WHEN_BOUNDARY", "WITHIN", "OUTSIDE",
  "UNLESS_EXCEPTION",
  "COMPLIANT", "VIOLATION", "EXCEPTION_APPLIED",
  "GTE", "LTE", "EQ", "GT", "LT",
]);

/* Multi-character then single-character punctuation, longest match first. */
const PUNCT = [
  ["{", "LBRACE"], ["}", "RBRACE"],
  ["[", "LBRACK"], ["]", "RBRACK"],
  ["(", "LPAREN"], [")", "RPAREN"],
  [",", "COMMA"], [";", "SEMI"], [":", "COLON"],
  ["=", "EQUALS"],
];

const isIdentStart = c => /[A-Za-z_]/.test(c);
const isIdentPart = c => /[A-Za-z0-9_]/.test(c);
const isDigit = c => c >= "0" && c <= "9";

export function lex(src) {
  const toks = [];
  let i = 0, line = 1, col = 1;
  const push = (type, value, l, c) => toks.push({ type, value, line: l, col: c });
  const err = (m, code) => { throw new IGLError(m, { line, col, phase: "lex", code: code || "LEX_ERROR" }); };

  while (i < src.length) {
    const c = src[i];

    if (c === "\n") { i++; line++; col = 1; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; col++; continue; }

    // line comment: -- to end of line
    if (c === "-" && src[i + 1] === "-") { while (i < src.length && src[i] !== "\n") i++; continue; }

    // string literal
    if (c === '"') {
      const sL = line, sC = col; let raw = '"'; i++; col++;
      for (;;) {
        if (i >= src.length) { line = sL; col = sC; err("unterminated string", "UNTERMINATED_STRING"); }
        const ch = src[i];
        if (ch === "\n") err("newline in string", "NEWLINE_IN_STRING");
        raw += ch; i++; col++;
        if (ch === "\\") { raw += src[i]; i++; col++; continue; }
        if (ch === '"') break;
      }
      let val; try { val = JSON.parse(raw); } catch { line = sL; col = sC; err("bad string", "BAD_STRING"); }
      push("STRING", val, sL, sC); continue;
    }

    // number (integer or float), optionally negative
    if (isDigit(c) || (c === "-" && isDigit(src[i + 1] || ""))) {
      const sC = col; let j = i; if (src[j] === "-") j++;
      while (j < src.length && isDigit(src[j])) j++;
      let isFloat = false;
      if (src[j] === "." && isDigit(src[j + 1] || "")) { isFloat = true; j++; while (j < src.length && isDigit(src[j])) j++; }
      const text = src.slice(i, j); col += text.length; i = j;
      push(isFloat ? "FLOAT" : "INT", Number(text), line, sC); continue;
    }

    // identifier / keyword. Also handles version literals like v1.0 as a KEYWORD "IGL" follower.
    if (isIdentStart(c)) {
      const sC = col; let j = i;
      while (j < src.length && isIdentPart(src[j])) j++;
      // allow a trailing ".<digits>" only for version tokens like v1.0
      let text = src.slice(i, j);
      if ((text === "v" || /^v\d+$/.test(text)) && src[j] === "." && isDigit(src[j + 1] || "")) {
        let k = j + 1; while (k < src.length && isDigit(src[k])) k++;
        text = src.slice(i, k); j = k;
        col += text.length; i = j; push("VERSION", text, line, sC); continue;
      }
      col += text.length; i = j;
      push(KEYWORDS.has(text) ? "KEYWORD" : "IDENT", text, line, sC); continue;
    }

    // punctuation
    let matched = false;
    for (const [lit, type] of PUNCT) {
      if (src.startsWith(lit, i)) { push(type, lit, line, col); i += lit.length; col += lit.length; matched = true; break; }
    }
    if (matched) continue;

    err(`unexpected character ${JSON.stringify(c)}`, "UNEXPECTED_CHAR");
  }
  push("EOF", null, line, col);
  return toks;
}
