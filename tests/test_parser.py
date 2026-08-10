"""Tests for the IGL parser."""

import pytest
from igl.lexer import Lexer
from igl.parser import Parser, ParseError
from igl.parser.ast_nodes import (
    Program, IntegerLiteral, FloatLiteral, StringLiteral, BoolLiteral,
    NullLiteral, Identifier, BinaryOp, UnaryOp, LetStatement, IfStatement,
    WhileStatement, ForStatement, FunctionDef, ReturnStatement,
    ExprStatement, Block, Call, ListLiteral, DictLiteral,
    IdentityDecl, ReasonBlock, AssertReason, LoopCloseStatement,
    UDMBlock, DriftStatement, AnchorStatement, ResolveStatement,
    TrustStatement, VerifyStatement, FrameDecl, BindStatement,
    UnbindStatement, PropagateStatement, IdentityRef, TrustAnnotation,
    DriftEquality, ArrowPipe, EmitExpr,
)


def parse(source: str) -> Program:
    tokens = Lexer(source, "<test>").tokenize()
    return Parser(tokens, "<test>").parse()


def first_stmt(source: str):
    return parse(source).body[0]


def first_expr(source: str):
    stmt = first_stmt(source)
    if isinstance(stmt, ExprStatement):
        return stmt.expr
    return stmt


class TestLiteralParsing:
    def test_integer(self):
        n = first_expr("42")
        assert isinstance(n, IntegerLiteral)
        assert n.value == 42

    def test_float(self):
        n = first_expr("3.14")
        assert isinstance(n, FloatLiteral)

    def test_string(self):
        n = first_expr('"hello"')
        assert isinstance(n, StringLiteral)
        assert n.value == "hello"

    def test_true(self):
        n = first_expr("true")
        assert isinstance(n, BoolLiteral)
        assert n.value is True

    def test_false(self):
        n = first_expr("false")
        assert isinstance(n, BoolLiteral)
        assert n.value is False

    def test_null(self):
        n = first_expr("null")
        assert isinstance(n, NullLiteral)

    def test_list_literal(self):
        n = first_expr("[1, 2, 3]")
        assert isinstance(n, ListLiteral)
        assert len(n.elements) == 3

    def test_dict_literal(self):
        n = first_expr('{"a": 1, "b": 2}')
        assert isinstance(n, DictLiteral)
        assert len(n.pairs) == 2


class TestExpressions:
    def test_binary_add(self):
        n = first_expr("1 + 2")
        assert isinstance(n, BinaryOp)
        assert n.op == "+"

    def test_binary_mul_precedence(self):
        n = first_expr("2 + 3 * 4")
        assert isinstance(n, BinaryOp)
        assert n.op == "+"
        assert isinstance(n.right, BinaryOp)
        assert n.right.op == "*"

    def test_unary_minus(self):
        n = first_expr("-5")
        assert isinstance(n, UnaryOp)
        assert n.op == "-"

    def test_unary_not(self):
        n = first_expr("not true")
        assert isinstance(n, UnaryOp)
        assert n.op == "not"

    def test_grouped(self):
        n = first_expr("(1 + 2) * 3")
        assert isinstance(n, BinaryOp)
        assert n.op == "*"
        assert isinstance(n.left, BinaryOp)

    def test_comparison(self):
        n = first_expr("a == b")
        assert isinstance(n, BinaryOp)
        assert n.op == "=="

    def test_call_no_args(self):
        n = first_expr("foo()")
        assert isinstance(n, Call)

    def test_call_with_args(self):
        n = first_expr("foo(1, 2, 3)")
        assert isinstance(n, Call)
        assert len(n.args) == 3

    def test_attribute_access(self):
        from igl.parser.ast_nodes import AttributeAccess
        n = first_expr("obj.attr")
        assert isinstance(n, AttributeAccess)
        assert n.attr == "attr"

    def test_index_access(self):
        from igl.parser.ast_nodes import IndexAccess
        n = first_expr("lst[0]")
        assert isinstance(n, IndexAccess)

    def test_arrow_pipe(self):
        n = first_expr("x -> f")
        assert isinstance(n, ArrowPipe)

    def test_drift_equality(self):
        n = first_expr("a ~= b")
        assert isinstance(n, DriftEquality)

    def test_trust_annotation(self):
        n = first_expr("#! 0.9 42")
        assert isinstance(n, TrustAnnotation)
        assert n.score == pytest.approx(0.9)

    def test_identity_ref(self):
        n = first_expr("@agent")
        assert isinstance(n, IdentityRef)
        assert n.name == "agent"


class TestStatements:
    def test_let(self):
        s = first_stmt("let x = 10")
        assert isinstance(s, LetStatement)
        assert s.name == "x"
        assert s.mutable is True

    def test_const(self):
        s = first_stmt("const PI = 3.14")
        assert isinstance(s, LetStatement)
        assert s.mutable is False

    def test_if(self):
        s = first_stmt("if x { y }")
        assert isinstance(s, IfStatement)
        assert s.else_block is None

    def test_if_else(self):
        s = first_stmt("if x { a } else { b }")
        assert isinstance(s, IfStatement)
        assert s.else_block is not None

    def test_while(self):
        s = first_stmt("while x { y }")
        assert isinstance(s, WhileStatement)

    def test_for(self):
        s = first_stmt("for i in lst { x }")
        assert isinstance(s, ForStatement)
        assert s.target == "i"

    def test_function_def(self):
        s = first_stmt("def add(a, b) { return a + b }")
        assert isinstance(s, FunctionDef)
        assert s.name == "add"
        assert s.params == ["a", "b"]

    def test_return(self):
        prog = parse("def f() { return 42 }")
        fn = prog.body[0]
        ret = fn.body.statements[0]
        assert isinstance(ret, ReturnStatement)


class TestIGLNativeStatements:
    def test_identity_decl(self):
        src = 'identity agent { role: "AI", trust: 0.9 }'
        s = first_stmt(src)
        assert isinstance(s, IdentityDecl)
        assert s.name == "agent"
        assert len(s.attributes) == 2

    def test_reason_block(self):
        s = first_stmt("reason myblock { resolve 42 }")
        assert isinstance(s, ReasonBlock)
        assert s.label == "myblock"

    def test_reason_block_no_label(self):
        s = first_stmt("reason { resolve 1 }")
        assert isinstance(s, ReasonBlock)
        assert s.label is None

    def test_assert_reason(self):
        s = first_stmt('assert_reason x > 0 : "must be positive"')
        assert isinstance(s, AssertReason)

    def test_loop_close(self):
        s = first_stmt("loop_close result")
        assert isinstance(s, LoopCloseStatement)

    def test_udm_block(self):
        s = first_stmt("udm compute { resolve 1 }")
        assert isinstance(s, UDMBlock)
        assert s.name == "compute"

    def test_drift(self):
        s = first_stmt("drift tol = 0.01")
        assert isinstance(s, DriftStatement)
        assert s.name == "tol"

    def test_anchor(self):
        s = first_stmt("anchor x in @agent")
        assert isinstance(s, AnchorStatement)
        assert s.identity == "agent"

    def test_resolve(self):
        s = first_stmt("resolve 42")
        assert isinstance(s, ResolveStatement)

    def test_trust_stmt(self):
        s = first_stmt("trust agent = 0.8")
        assert isinstance(s, TrustStatement)
        assert s.name == "agent"

    def test_verify(self):
        s = first_stmt("verify @agent")
        assert isinstance(s, VerifyStatement)
        assert s.identity == "agent"

    def test_frame_decl(self):
        s = first_stmt("frame ctx { let x = 1 }")
        assert isinstance(s, FrameDecl)
        assert s.name == "ctx"

    def test_bind(self):
        s = first_stmt("bind value => @agent")
        assert isinstance(s, BindStatement)
        assert s.name == "value"
        assert s.identity == "agent"

    def test_unbind(self):
        s = first_stmt("unbind value")
        assert isinstance(s, UnbindStatement)
        assert s.name == "value"

    def test_propagate(self):
        s = first_stmt("propagate @src -> @tgt")
        assert isinstance(s, PropagateStatement)
        assert s.source == "src"
        assert s.target == "tgt"


class TestParseErrors:
    def test_missing_closing_paren(self):
        with pytest.raises(ParseError):
            parse("foo(1, 2")

    def test_missing_rbrace(self):
        with pytest.raises(ParseError):
            parse("identity agent { role: 1")

    def test_bad_assignment_target(self):
        with pytest.raises(ParseError):
            parse("42 = x")
