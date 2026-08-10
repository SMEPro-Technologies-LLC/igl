"""
IGL Token definitions.

IGL introduces primitives that model identity, reasoning loops, and
deterministic computation (UDM) - concepts absent from traditional languages.
"""

from enum import Enum, auto
from dataclasses import dataclass
from typing import Any


class TokenType(Enum):
    # ── Literals ──────────────────────────────────────────────────────────────
    INTEGER = auto()
    FLOAT = auto()
    STRING = auto()
    BOOL = auto()       # true | false
    NULL = auto()       # null

    # ── Identifiers & Keywords ────────────────────────────────────────────────
    IDENTIFIER = auto()

    # Core control flow
    IF = auto()
    ELSE = auto()
    ELIF = auto()
    WHILE = auto()
    FOR = auto()
    IN = auto()
    RETURN = auto()
    BREAK = auto()
    CONTINUE = auto()

    # Definitions
    DEF = auto()        # function definition
    LET = auto()        # mutable binding
    CONST = auto()      # immutable binding
    IMPORT = auto()
    FROM = auto()
    AS = auto()

    # ── IGL-native keywords ───────────────────────────────────────────────────
    IDENTITY = auto()   # declares an identity frame
    REASON = auto()     # opens a reasoning block
    ASSERT_REASON = auto()  # assert_reason: logical claim that must hold
    LOOP_CLOSE = auto() # loop_close: marks a closed-loop computation
    UDM = auto()        # udm: universal deterministic model block
    DRIFT = auto()      # drift: allowable uncertainty range
    ANCHOR = auto()     # anchor: pin a value to an identity frame
    RESOLVE = auto()    # resolve: finalize a reasoning loop
    EMIT = auto()       # emit: output a value from a reasoning context
    TRUST = auto()      # trust: attach a confidence score to a value
    VERIFY = auto()     # verify: check identity consistency
    FRAME = auto()      # frame: a bounded context window
    BIND = auto()       # bind: associate value with identity
    UNBIND = auto()     # unbind: release an identity binding
    PROPAGATE = auto()  # propagate: forward identity attributes

    # ── Operators ─────────────────────────────────────────────────────────────
    PLUS = auto()
    MINUS = auto()
    STAR = auto()
    SLASH = auto()
    PERCENT = auto()
    STAR_STAR = auto()  # **  exponentiation

    EQ = auto()         # ==
    NEQ = auto()        # !=
    LT = auto()         # <
    GT = auto()         # >
    LTE = auto()        # <=
    GTE = auto()        # >=

    AND = auto()        # and / &&
    OR = auto()         # or  / ||
    NOT = auto()        # not / !

    # Bitwise
    AMP = auto()        # &
    PIPE = auto()       # |
    CARET = auto()      # ^
    TILDE = auto()      # ~
    LSHIFT = auto()     # <<
    RSHIFT = auto()     # >>

    # Assignment
    ASSIGN = auto()     # =
    PLUS_ASSIGN = auto()    # +=
    MINUS_ASSIGN = auto()   # -=
    STAR_ASSIGN = auto()    # *=
    SLASH_ASSIGN = auto()   # /=
    PERCENT_ASSIGN = auto() # %=

    # IGL-specific operators
    ARROW = auto()      # ->   (emit / pipe)
    FAT_ARROW = auto()  # =>   (bind mapping)
    TILDE_EQ = auto()   # ~=   (drift equality – within tolerance)
    AT = auto()         # @    (identity reference)
    HASH_BANG = auto()  # #!   (trust annotation prefix)
    COLON_COLON = auto()  # ::  (frame scope resolution)

    # ── Delimiters ────────────────────────────────────────────────────────────
    LPAREN = auto()
    RPAREN = auto()
    LBRACE = auto()
    RBRACE = auto()
    LBRACKET = auto()
    RBRACKET = auto()
    COMMA = auto()
    DOT = auto()
    COLON = auto()
    SEMICOLON = auto()
    NEWLINE = auto()

    # ── Special ───────────────────────────────────────────────────────────────
    EOF = auto()
    COMMENT = auto()


# ── Keyword lookup table ──────────────────────────────────────────────────────
KEYWORDS: dict[str, TokenType] = {
    "if": TokenType.IF,
    "else": TokenType.ELSE,
    "elif": TokenType.ELIF,
    "while": TokenType.WHILE,
    "for": TokenType.FOR,
    "in": TokenType.IN,
    "return": TokenType.RETURN,
    "break": TokenType.BREAK,
    "continue": TokenType.CONTINUE,
    "def": TokenType.DEF,
    "let": TokenType.LET,
    "const": TokenType.CONST,
    "import": TokenType.IMPORT,
    "from": TokenType.FROM,
    "as": TokenType.AS,
    "true": TokenType.BOOL,
    "false": TokenType.BOOL,
    "null": TokenType.NULL,
    "and": TokenType.AND,
    "or": TokenType.OR,
    "not": TokenType.NOT,
    # IGL-native
    "identity": TokenType.IDENTITY,
    "reason": TokenType.REASON,
    "assert_reason": TokenType.ASSERT_REASON,
    "loop_close": TokenType.LOOP_CLOSE,
    "udm": TokenType.UDM,
    "drift": TokenType.DRIFT,
    "anchor": TokenType.ANCHOR,
    "resolve": TokenType.RESOLVE,
    "emit": TokenType.EMIT,
    "trust": TokenType.TRUST,
    "verify": TokenType.VERIFY,
    "frame": TokenType.FRAME,
    "bind": TokenType.BIND,
    "unbind": TokenType.UNBIND,
    "propagate": TokenType.PROPAGATE,
}


@dataclass(frozen=True)
class Token:
    """A single lexical token produced by the IGL lexer."""

    type: TokenType
    value: Any
    line: int
    column: int
    filename: str = "<igl>"

    def __repr__(self) -> str:
        return f"Token({self.type.name}, {self.value!r}, {self.line}:{self.column})"
