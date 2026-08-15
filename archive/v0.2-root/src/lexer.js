// SPDX-License-Identifier: Apache-2.0
/* IGL lexer — v0.2
   Token classes are deliberately narrow: the value types the language can
   express are the value types UDM can govern. See docs/CRITIQUE.md §A2. */

export class IGLError extends Error {
  constructor(message, { line = 0, col = 0, phase = "lex", code = "IGL_ERROR" } = {}) {
    super(message);
    this.name = "IGLError";
    this.line = line; this.col = col; this.phase = phase; this.code = code;
  }
  toString() { return `${this.phase}:${this.code} ${this.message} (line ${this.line}, col ${this.col})`; }
}

export const KEYWORDS = new Set([
  "ID", "Intent", "Compute", "Output", "OnFail", "Context",
]);

const PUNCT = [
  ["::", "COLONCOLON"],
  ["=>", "ARROW_INTENT"],
  ["⇒", "ARROW_INTENT"],
  ["->", "ARROW_OUT"],
  ["→", "ARROW_OUT"],
  ["[", "LBRACK"], ["]", "RBRACK"],
  ["(", "LPAREN"], [")", "RPAREN"],
  [",", "COMMA"], [";", "SEMI"],
  ["|", "PIPE"], [":", "COLON"],
  ["=", "EQ"], [".", "DOT"], ["@", "AT"],
];

const isIdentStart = c => /[A-Za-z_]/.test(c);
const isIdentPart = c => /[A-Za-z0-9_]/.test(c);
/* Codes carry hyphens but never dots: `.` is always the subsystem scoping
   operator, so `UDM.Resolve` can never be mistaken for a single token.
   A value needing a dot is a string. See SPEC.md §3.2. */
const isCodePart = c => /[A-Za-z0-9_\-]/.test(c);
const isDigit = c => c >= "0" && c <= "9";
const NUMBER_RE = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/;

export function lex(src) {
  const toks = [];
  let i = 0, line = 1, col = 1;
  const at = () => src[i];
  const push = (type, value, l, c) => toks.push({ type, value, line: l, col: c });
  const err = (m, code) => { throw new IGLError(m, { line, col, phase: "lex", code }); };

  while (i < src.length) {
    const c = src[i];

    if (c === "\n") { i++; line++; col = 1; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; col++; continue; }

    // comments — # to end of line (CRITIQUE A5)
    if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }

    // version pragma — %igl 0.2 (CRITIQUE D2)
    if (c === "%" && src.slice(i, i + 4) === "%igl") {
      const startCol = col;
      i += 4; col += 4;
      while (i < src.length && (src[i] === " " || src[i] === "\t")) { i++; col++; }
      let v = "";
      while (i < src.length && /[0-9.]/.test(src[i])) { v += src[i]; i++; col++; }
      push("PRAGMA", v, line, startCol);
      continue;
    }

    // string literal — JSON syntax exactly (CRITIQUE A6)
    if (c === '"') {
      const startLine = line, startCol = col;
      let raw = '"';
      i++; col++;
      for (;;) {
        if (i >= src.length) { line = startLine; col = startCol; err("unterminated string literal", "IGL_UNTERMINATED_STRING"); }
        const ch = src[i];
        if (ch === "\n") { err("newline in string literal — use \\n", "IGL_NEWLINE_IN_STRING"); }
        raw += ch; i++; col++;
        if (ch === "\\") {
          if (i >= src.length) err("dangling escape in string literal", "IGL_BAD_ESCAPE");
          raw += src[i]; i++; col++;
          continue;
        }
        if (ch === '"') break;
      }
      let value;
      try { value = JSON.parse(raw); }
      catch { line = startLine; col = startCol; err("malformed string literal", "IGL_BAD_STRING"); }
      push("STRING", value, startLine, startCol);
      continue;
    }

    // numbers — tried first, but only when the run really is numeric.
    // `2026-Q3` starts numeric and is not a number; `1.5` is.
    if (isDigit(c) || (c === "-" && isDigit(src[i + 1] || ""))) {
      const startCol = col;
      const m = NUMBER_RE.exec(src.slice(i));
      if (m) {
        const after = src[i + m[0].length] || "";
        if (!isCodePart(after)) {
          col += m[0].length; i += m[0].length;
          push("NUMBER", Number(m[0]), line, startCol);
          continue;
        }
      }
      // falls through to the code scan below (e.g. 2026-Q3, 3M-Brand)
    }

    if (isDigit(c) || isIdentStart(c)) {
      const startCol = col;
      let j = i;
      while (j < src.length && isCodePart(src[j])) j++;
      const text = src.slice(i, j);
      const advance = () => { col += text.length; i = j; };

      // plain identifier / keyword
      if (isIdentStart(text[0]) && [...text].every(isIdentPart)) {
        advance();
        push(KEYWORDS.has(text) ? "KEYWORD" : "IDENT", text, line, startCol);
        continue;
      }
      // governed code: TX-RRC, PR-202, 2026-Q3, TRC-004982
      if (/^[A-Za-z0-9_][A-Za-z0-9_\-]*$/.test(text) && !text.endsWith("-")) {
        advance(); push("CODE", text, line, startCol); continue;
      }
      err(`cannot tokenise ${JSON.stringify(text)}`, "IGL_BAD_TOKEN");
    }

    // punctuation, longest match first
    let matched = false;
    for (const [lit, type] of PUNCT) {
      if (src.startsWith(lit, i)) {
        push(type, lit, line, col);
        i += lit.length; col += lit.length;
        matched = true; break;
      }
    }
    if (matched) continue;

    err(`unexpected character ${JSON.stringify(c)}`, "IGL_UNEXPECTED_CHAR");
  }

  push("EOF", null, line, col);
  return toks;
}
