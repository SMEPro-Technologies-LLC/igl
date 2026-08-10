"""Tests for the IGL lexer."""

import pytest
from igl.lexer import Lexer, LexError
from igl.lexer.tokens import TokenType


def tokenize(source: str):
    return Lexer(source, "<test>").tokenize()


def types(source: str):
    return [t.type for t in tokenize(source) if t.type != TokenType.EOF]


class TestLiterals:
    def test_integer(self):
        toks = tokenize("42")
        assert toks[0].type == TokenType.INTEGER
        assert toks[0].value == 42

    def test_negative_float(self):
        toks = tokenize("3.14")
        assert toks[0].type == TokenType.FLOAT
        assert abs(toks[0].value - 3.14) < 1e-9

    def test_scientific(self):
        toks = tokenize("1e5")
        assert toks[0].type == TokenType.FLOAT
        assert toks[0].value == 1e5

    def test_string_double(self):
        toks = tokenize('"hello"')
        assert toks[0].type == TokenType.STRING
        assert toks[0].value == "hello"

    def test_string_single(self):
        toks = tokenize("'world'")
        assert toks[0].type == TokenType.STRING
        assert toks[0].value == "world"

    def test_string_escape(self):
        toks = tokenize(r'"line\nnext"')
        assert toks[0].value == "line\nnext"

    def test_true_false(self):
        ts = tokenize("true false")
        assert ts[0].type == TokenType.BOOL and ts[0].value is True
        assert ts[1].type == TokenType.BOOL and ts[1].value is False

    def test_null(self):
        ts = tokenize("null")
        assert ts[0].type == TokenType.NULL
        assert ts[0].value is None

    def test_underscore_number(self):
        ts = tokenize("1_000_000")
        assert ts[0].value == 1_000_000


class TestKeywords:
    def test_igl_keywords(self):
        kws = ["identity", "reason", "assert_reason", "loop_close",
               "udm", "drift", "anchor", "resolve", "emit",
               "trust", "verify", "frame", "bind", "unbind", "propagate"]
        expected = [
            TokenType.IDENTITY, TokenType.REASON, TokenType.ASSERT_REASON,
            TokenType.LOOP_CLOSE, TokenType.UDM, TokenType.DRIFT,
            TokenType.ANCHOR, TokenType.RESOLVE, TokenType.EMIT,
            TokenType.TRUST, TokenType.VERIFY, TokenType.FRAME,
            TokenType.BIND, TokenType.UNBIND, TokenType.PROPAGATE,
        ]
        for kw, exp in zip(kws, expected):
            ts = tokenize(kw)
            assert ts[0].type == exp, f"Keyword {kw!r} -> expected {exp}"

    def test_standard_keywords(self):
        assert types("if else elif while for in return break continue") == [
            TokenType.IF, TokenType.ELSE, TokenType.ELIF,
            TokenType.WHILE, TokenType.FOR, TokenType.IN,
            TokenType.RETURN, TokenType.BREAK, TokenType.CONTINUE,
        ]


class TestOperators:
    def test_arrow(self):
        ts = tokenize("->")
        assert ts[0].type == TokenType.ARROW

    def test_fat_arrow(self):
        ts = tokenize("=>")
        assert ts[0].type == TokenType.FAT_ARROW

    def test_tilde_eq(self):
        ts = tokenize("~=")
        assert ts[0].type == TokenType.TILDE_EQ

    def test_hash_bang(self):
        ts = tokenize("#! 0.9 x")
        assert ts[0].type == TokenType.HASH_BANG

    def test_colon_colon(self):
        ts = tokenize("::")
        assert ts[0].type == TokenType.COLON_COLON

    def test_at(self):
        ts = tokenize("@agent")
        assert ts[0].type == TokenType.AT
        assert ts[1].type == TokenType.IDENTIFIER

    def test_comparison_ops(self):
        src = "== != < > <= >="
        expected = [TokenType.EQ, TokenType.NEQ, TokenType.LT,
                    TokenType.GT, TokenType.LTE, TokenType.GTE]
        assert types(src) == expected

    def test_arithmetic_ops(self):
        src = "+ - * / % **"
        expected = [TokenType.PLUS, TokenType.MINUS, TokenType.STAR,
                    TokenType.SLASH, TokenType.PERCENT, TokenType.STAR_STAR]
        assert types(src) == expected

    def test_assign_ops(self):
        src = "+= -= *= /= %="
        expected = [TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN,
                    TokenType.STAR_ASSIGN, TokenType.SLASH_ASSIGN,
                    TokenType.PERCENT_ASSIGN]
        assert types(src) == expected


class TestComments:
    def test_line_comment(self):
        ts = tokenize("x # this is a comment\n")
        tts = [t.type for t in ts if t.type != TokenType.EOF]
        assert TokenType.COMMENT not in tts

    def test_hash_bang_is_token(self):
        ts = tokenize("#! 1.0")
        assert ts[0].type == TokenType.HASH_BANG


class TestErrors:
    def test_unterminated_string(self):
        with pytest.raises(LexError):
            tokenize('"unterminated')

    def test_unexpected_character(self):
        with pytest.raises(LexError):
            tokenize("$")


class TestNewlines:
    def test_newline_token(self):
        ts = tokenize("a\nb")
        tts = [t.type for t in ts]
        assert TokenType.NEWLINE in tts

    def test_no_double_newlines(self):
        ts = tokenize("a\n\n\nb")
        newlines = [t for t in ts if t.type == TokenType.NEWLINE]
        # Should not have consecutive NEWLINEs
        assert len(newlines) == 1
