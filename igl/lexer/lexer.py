"""IGL Lexer – tokenises IGL source text."""

from __future__ import annotations

from typing import List

from .tokens import Token, TokenType, KEYWORDS


class LexError(Exception):
    """Raised when the lexer encounters illegal input."""

    def __init__(self, message: str, line: int, column: int, filename: str = "<igl>"):
        super().__init__(f"{filename}:{line}:{column}: {message}")
        self.line = line
        self.column = column
        self.filename = filename


class Lexer:
    """
    Converts raw IGL source text into a flat list of :class:`Token` objects.

    IGL is whitespace-sensitive only for statement termination: a NEWLINE
    token is emitted at the end of every logical line.  Blank lines and
    comment-only lines do **not** emit NEWLINE tokens.
    """

    def __init__(self, source: str, filename: str = "<igl>"):
        self.source = source
        self.filename = filename
        self.pos = 0
        self.line = 1
        self.column = 1
        self._tokens: List[Token] = []

    # ── Public ────────────────────────────────────────────────────────────────

    def tokenize(self) -> List[Token]:
        """Return all tokens for the source text."""
        while not self._at_end():
            self._scan_token()
        self._emit(TokenType.EOF, None)
        return self._tokens

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _at_end(self) -> bool:
        return self.pos >= len(self.source)

    def _peek(self, offset: int = 0) -> str:
        idx = self.pos + offset
        if idx >= len(self.source):
            return "\0"
        return self.source[idx]

    def _advance(self) -> str:
        ch = self.source[self.pos]
        self.pos += 1
        if ch == "\n":
            self.line += 1
            self.column = 1
        else:
            self.column += 1
        return ch

    def _match(self, expected: str) -> bool:
        if self._at_end() or self.source[self.pos] != expected:
            return False
        self._advance()
        return True

    def _emit(self, ttype: TokenType, value, line: int = None, col: int = None) -> None:
        self._tokens.append(
            Token(ttype, value, line or self.line, col or self.column, self.filename)
        )

    def _error(self, msg: str) -> LexError:
        return LexError(msg, self.line, self.column, self.filename)

    # ── Scanning ──────────────────────────────────────────────────────────────

    def _scan_token(self) -> None:  # noqa: C901  (complex but intentional)
        start_line = self.line
        start_col = self.column
        ch = self._advance()

        # ── Whitespace (not newlines) ─────────────────────────────────────────
        if ch in (" ", "\t", "\r"):
            return

        # ── Newlines ──────────────────────────────────────────────────────────
        if ch == "\n":
            # Emit NEWLINE only when there's something on the previous line
            if self._tokens and self._tokens[-1].type not in (
                TokenType.NEWLINE,
                TokenType.EOF,
                TokenType.LBRACE,
                TokenType.COMMA,
            ):
                self._emit(TokenType.NEWLINE, "\n", start_line, start_col)
            return

        # ── Comments ──────────────────────────────────────────────────────────
        if ch == "#":
            if self._peek() == "!":
                # #! trust annotation prefix
                self._advance()
                self._emit(TokenType.HASH_BANG, "#!", start_line, start_col)
                return
            # Line comment – consume until end of line
            while not self._at_end() and self._peek() != "\n":
                self._advance()
            return

        # ── Strings ───────────────────────────────────────────────────────────
        if ch in ('"', "'"):
            self._scan_string(ch, start_line, start_col)
            return

        # ── Numbers ───────────────────────────────────────────────────────────
        if ch.isdigit():
            self._scan_number(ch, start_line, start_col)
            return

        # ── Identifiers & Keywords ────────────────────────────────────────────
        if ch.isalpha() or ch == "_":
            self._scan_identifier(ch, start_line, start_col)
            return

        # ── Compound & single-character operators ─────────────────────────────
        match ch:
            case "+":
                if self._match("="):
                    self._emit(TokenType.PLUS_ASSIGN, "+=", start_line, start_col)
                else:
                    self._emit(TokenType.PLUS, "+", start_line, start_col)
            case "-":
                if self._match(">"):
                    self._emit(TokenType.ARROW, "->", start_line, start_col)
                elif self._match("="):
                    self._emit(TokenType.MINUS_ASSIGN, "-=", start_line, start_col)
                else:
                    self._emit(TokenType.MINUS, "-", start_line, start_col)
            case "*":
                if self._match("*"):
                    self._emit(TokenType.STAR_STAR, "**", start_line, start_col)
                elif self._match("="):
                    self._emit(TokenType.STAR_ASSIGN, "*=", start_line, start_col)
                else:
                    self._emit(TokenType.STAR, "*", start_line, start_col)
            case "/":
                if self._match("/"):
                    # Floor division – treat as two tokens or add SLASH_SLASH later
                    self._emit(TokenType.SLASH, "//", start_line, start_col)
                elif self._match("="):
                    self._emit(TokenType.SLASH_ASSIGN, "/=", start_line, start_col)
                else:
                    self._emit(TokenType.SLASH, "/", start_line, start_col)
            case "%":
                if self._match("="):
                    self._emit(TokenType.PERCENT_ASSIGN, "%=", start_line, start_col)
                else:
                    self._emit(TokenType.PERCENT, "%", start_line, start_col)
            case "=":
                if self._match("="):
                    self._emit(TokenType.EQ, "==", start_line, start_col)
                elif self._match(">"):
                    self._emit(TokenType.FAT_ARROW, "=>", start_line, start_col)
                else:
                    self._emit(TokenType.ASSIGN, "=", start_line, start_col)
            case "!":
                if self._match("="):
                    self._emit(TokenType.NEQ, "!=", start_line, start_col)
                else:
                    self._emit(TokenType.NOT, "!", start_line, start_col)
            case "<":
                if self._match("="):
                    self._emit(TokenType.LTE, "<=", start_line, start_col)
                elif self._match("<"):
                    self._emit(TokenType.LSHIFT, "<<", start_line, start_col)
                else:
                    self._emit(TokenType.LT, "<", start_line, start_col)
            case ">":
                if self._match("="):
                    self._emit(TokenType.GTE, ">=", start_line, start_col)
                elif self._match(">"):
                    self._emit(TokenType.RSHIFT, ">>", start_line, start_col)
                else:
                    self._emit(TokenType.GT, ">", start_line, start_col)
            case "&":
                if self._match("&"):
                    self._emit(TokenType.AND, "&&", start_line, start_col)
                else:
                    self._emit(TokenType.AMP, "&", start_line, start_col)
            case "|":
                if self._match("|"):
                    self._emit(TokenType.OR, "||", start_line, start_col)
                else:
                    self._emit(TokenType.PIPE, "|", start_line, start_col)
            case "^":
                self._emit(TokenType.CARET, "^", start_line, start_col)
            case "~":
                if self._match("="):
                    self._emit(TokenType.TILDE_EQ, "~=", start_line, start_col)
                else:
                    self._emit(TokenType.TILDE, "~", start_line, start_col)
            case "@":
                self._emit(TokenType.AT, "@", start_line, start_col)
            case ":":
                if self._match(":"):
                    self._emit(TokenType.COLON_COLON, "::", start_line, start_col)
                else:
                    self._emit(TokenType.COLON, ":", start_line, start_col)
            case "(":
                self._emit(TokenType.LPAREN, "(", start_line, start_col)
            case ")":
                self._emit(TokenType.RPAREN, ")", start_line, start_col)
            case "{":
                self._emit(TokenType.LBRACE, "{", start_line, start_col)
            case "}":
                self._emit(TokenType.RBRACE, "}", start_line, start_col)
            case "[":
                self._emit(TokenType.LBRACKET, "[", start_line, start_col)
            case "]":
                self._emit(TokenType.RBRACKET, "]", start_line, start_col)
            case ",":
                self._emit(TokenType.COMMA, ",", start_line, start_col)
            case ".":
                self._emit(TokenType.DOT, ".", start_line, start_col)
            case ";":
                self._emit(TokenType.SEMICOLON, ";", start_line, start_col)
            case _:
                raise self._error(f"Unexpected character: {ch!r}")

    def _scan_string(self, quote: str, start_line: int, start_col: int) -> None:
        buf: list[str] = []
        while not self._at_end() and self._peek() != quote:
            ch = self._advance()
            if ch == "\\":
                esc = self._advance()
                buf.append({"n": "\n", "t": "\t", "r": "\r",
                             "\\": "\\", "'": "'", '"': '"'}.get(esc, esc))
            else:
                buf.append(ch)
        if self._at_end():
            raise self._error("Unterminated string literal")
        self._advance()  # closing quote
        self._emit(TokenType.STRING, "".join(buf), start_line, start_col)

    def _scan_number(self, first: str, start_line: int, start_col: int) -> None:
        buf = [first]
        is_float = False
        while not self._at_end() and (self._peek().isdigit() or self._peek() == "_"):
            ch = self._advance()
            if ch != "_":
                buf.append(ch)
        if self._peek() == "." and self._peek(1).isdigit():
            is_float = True
            buf.append(self._advance())  # '.'
            while not self._at_end() and self._peek().isdigit():
                buf.append(self._advance())
        if self._peek() in ("e", "E"):
            is_float = True
            buf.append(self._advance())
            if self._peek() in ("+", "-"):
                buf.append(self._advance())
            while not self._at_end() and self._peek().isdigit():
                buf.append(self._advance())
        text = "".join(buf)
        if is_float:
            self._emit(TokenType.FLOAT, float(text), start_line, start_col)
        else:
            self._emit(TokenType.INTEGER, int(text), start_line, start_col)

    def _scan_identifier(self, first: str, start_line: int, start_col: int) -> None:
        buf = [first]
        while not self._at_end() and (self._peek().isalnum() or self._peek() == "_"):
            buf.append(self._advance())
        text = "".join(buf)
        ttype = KEYWORDS.get(text, TokenType.IDENTIFIER)
        # Resolve boolean & null literals
        if ttype == TokenType.BOOL:
            value: object = text == "true"
        elif ttype == TokenType.NULL:
            value = None
        else:
            value = text
        self._emit(ttype, value, start_line, start_col)
