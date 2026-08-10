"""
IGL Parser – converts a token stream into an AST.

The parser is a hand-written recursive-descent parser.  Operator precedence
follows the table in the language specification (docs/spec.md).
"""

from __future__ import annotations

from typing import List, Optional, Tuple

from ..lexer.tokens import Token, TokenType, KEYWORDS
from .ast_nodes import (
    # Expressions
    IntegerLiteral, FloatLiteral, StringLiteral, BoolLiteral, NullLiteral,
    Identifier, ListLiteral, DictLiteral, BinaryOp, UnaryOp, Assign,
    AttributeAccess, IndexAccess, Call, Lambda,
    # IGL expressions
    IdentityRef, FrameScopeRef, TrustAnnotation, DriftEquality,
    EmitExpr, ArrowPipe,
    # Statements
    Block, ExprStatement, LetStatement, IfStatement, WhileStatement,
    ForStatement, ReturnStatement, BreakStatement, ContinueStatement,
    FunctionDef, ImportStatement, FromImportStatement,
    # IGL statements
    IdentityDecl, ReasonBlock, AssertReason, LoopCloseStatement,
    UDMBlock, DriftStatement, AnchorStatement, ResolveStatement,
    TrustStatement, VerifyStatement, FrameDecl, BindStatement,
    UnbindStatement, PropagateStatement,
    # Root
    Program, Node,
)


class ParseError(Exception):
    """Raised when the parser encounters unexpected input."""

    def __init__(self, message: str, token: Token):
        loc = f"{token.filename}:{token.line}:{token.column}"
        super().__init__(f"{loc}: {message} (got {token.type.name} {token.value!r})")
        self.token = token


class Parser:
    """
    Recursive-descent parser for the IGL language.

    Usage::

        tokens = Lexer(source).tokenize()
        ast = Parser(tokens).parse()
    """

    def __init__(self, tokens: List[Token], filename: str = "<igl>"):
        self._tokens = [t for t in tokens if t.type != TokenType.COMMENT]
        self._pos = 0
        self._filename = filename

    # ── Public ────────────────────────────────────────────────────────────────

    def parse(self) -> Program:
        stmts: List[Node] = []
        self._skip_newlines()
        while not self._at_end():
            stmts.append(self._parse_statement())
            self._skip_terminators()
        tok = self._current()
        return Program(body=stmts, line=1, col=1)

    # ── Token navigation ──────────────────────────────────────────────────────

    def _at_end(self) -> bool:
        return self._current().type == TokenType.EOF

    def _current(self) -> Token:
        return self._tokens[self._pos]

    def _peek(self, offset: int = 1) -> Token:
        idx = self._pos + offset
        if idx >= len(self._tokens):
            return self._tokens[-1]  # EOF
        return self._tokens[idx]

    def _advance(self) -> Token:
        tok = self._tokens[self._pos]
        if self._pos < len(self._tokens) - 1:
            self._pos += 1
        return tok

    def _expect(self, ttype: TokenType) -> Token:
        tok = self._current()
        if tok.type != ttype:
            raise ParseError(f"Expected {ttype.name}", tok)
        return self._advance()

    def _match(self, *types: TokenType) -> bool:
        return self._current().type in types

    def _skip_newlines(self) -> None:
        while self._match(TokenType.NEWLINE):
            self._advance()

    def _skip_terminators(self) -> None:
        while self._match(TokenType.NEWLINE, TokenType.SEMICOLON):
            self._advance()

    # ── Statements ────────────────────────────────────────────────────────────

    def _parse_statement(self) -> Node:  # noqa: C901
        tok = self._current()

        # IGL-native statements first
        if tok.type == TokenType.IDENTITY:
            return self._parse_identity_decl()
        if tok.type == TokenType.REASON:
            return self._parse_reason_block()
        if tok.type == TokenType.ASSERT_REASON:
            return self._parse_assert_reason()
        if tok.type == TokenType.LOOP_CLOSE:
            return self._parse_loop_close()
        if tok.type == TokenType.UDM:
            return self._parse_udm_block()
        if tok.type == TokenType.DRIFT:
            return self._parse_drift_stmt()
        if tok.type == TokenType.ANCHOR:
            return self._parse_anchor_stmt()
        if tok.type == TokenType.RESOLVE:
            return self._parse_resolve_stmt()
        if tok.type == TokenType.TRUST:
            return self._parse_trust_stmt()
        if tok.type == TokenType.VERIFY:
            return self._parse_verify_stmt()
        if tok.type == TokenType.FRAME:
            return self._parse_frame_decl()
        if tok.type == TokenType.BIND:
            return self._parse_bind_stmt()
        if tok.type == TokenType.UNBIND:
            return self._parse_unbind_stmt()
        if tok.type == TokenType.PROPAGATE:
            return self._parse_propagate_stmt()
        if tok.type == TokenType.EMIT:
            return self._parse_emit_stmt()

        # Standard statements
        if tok.type in (TokenType.LET, TokenType.CONST):
            return self._parse_let_stmt()
        if tok.type == TokenType.DEF:
            return self._parse_function_def()
        if tok.type == TokenType.IF:
            return self._parse_if_stmt()
        if tok.type == TokenType.WHILE:
            return self._parse_while_stmt()
        if tok.type == TokenType.FOR:
            return self._parse_for_stmt()
        if tok.type == TokenType.RETURN:
            return self._parse_return_stmt()
        if tok.type == TokenType.BREAK:
            self._advance()
            return BreakStatement(line=tok.line, col=tok.column)
        if tok.type == TokenType.CONTINUE:
            self._advance()
            return ContinueStatement(line=tok.line, col=tok.column)
        if tok.type == TokenType.IMPORT:
            return self._parse_import_stmt()
        if tok.type == TokenType.FROM:
            return self._parse_from_import_stmt()

        return self._parse_expr_statement()

    def _parse_block(self) -> Block:
        tok = self._expect(TokenType.LBRACE)
        self._skip_newlines()
        stmts: List[Node] = []
        while not self._match(TokenType.RBRACE) and not self._at_end():
            stmts.append(self._parse_statement())
            self._skip_terminators()
        self._expect(TokenType.RBRACE)
        return Block(statements=stmts, line=tok.line, col=tok.column)

    def _parse_let_stmt(self) -> LetStatement:
        tok = self._advance()
        mutable = (tok.type == TokenType.LET)
        name_tok = self._expect(TokenType.IDENTIFIER)
        self._expect(TokenType.ASSIGN)
        value = self._parse_expr()
        return LetStatement(name=name_tok.value, mutable=mutable, value=value,
                            line=tok.line, col=tok.column)

    def _parse_function_def(self) -> FunctionDef:
        tok = self._expect(TokenType.DEF)
        name_tok = self._expect(TokenType.IDENTIFIER)
        self._expect(TokenType.LPAREN)
        params, defaults = self._parse_param_list()
        self._expect(TokenType.RPAREN)
        body = self._parse_block()
        return FunctionDef(name=name_tok.value, params=params, defaults=defaults,
                           body=body, line=tok.line, col=tok.column)

    def _parse_param_list(self) -> Tuple[List[str], List[Optional[Node]]]:
        params: List[str] = []
        defaults: List[Optional[Node]] = []
        while not self._match(TokenType.RPAREN) and not self._at_end():
            p = self._expect(TokenType.IDENTIFIER)
            params.append(p.value)
            if self._match(TokenType.ASSIGN):
                self._advance()
                defaults.append(self._parse_expr())
            else:
                defaults.append(None)
            if not self._match(TokenType.RPAREN):
                self._expect(TokenType.COMMA)
        return params, defaults

    def _parse_if_stmt(self) -> IfStatement:
        tok = self._expect(TokenType.IF)
        cond = self._parse_expr()
        then_block = self._parse_block()
        elif_clauses: List[Tuple[Node, Block]] = []
        else_block: Optional[Block] = None
        self._skip_newlines()
        while self._match(TokenType.ELIF):
            self._advance()
            ec = self._parse_expr()
            eb = self._parse_block()
            elif_clauses.append((ec, eb))
            self._skip_newlines()
        if self._match(TokenType.ELSE):
            self._advance()
            else_block = self._parse_block()
        return IfStatement(condition=cond, then_block=then_block,
                           elif_clauses=elif_clauses, else_block=else_block,
                           line=tok.line, col=tok.column)

    def _parse_while_stmt(self) -> WhileStatement:
        tok = self._expect(TokenType.WHILE)
        cond = self._parse_expr()
        body = self._parse_block()
        return WhileStatement(condition=cond, body=body,
                              line=tok.line, col=tok.column)

    def _parse_for_stmt(self) -> ForStatement:
        tok = self._expect(TokenType.FOR)
        target = self._expect(TokenType.IDENTIFIER).value
        self._expect(TokenType.IN)
        iterable = self._parse_expr()
        body = self._parse_block()
        return ForStatement(target=target, iterable=iterable, body=body,
                            line=tok.line, col=tok.column)

    def _parse_return_stmt(self) -> ReturnStatement:
        tok = self._expect(TokenType.RETURN)
        value: Optional[Node] = None
        if not self._match(TokenType.NEWLINE, TokenType.SEMICOLON,
                           TokenType.RBRACE, TokenType.EOF):
            value = self._parse_expr()
        return ReturnStatement(value=value, line=tok.line, col=tok.column)

    def _parse_import_stmt(self) -> ImportStatement:
        tok = self._expect(TokenType.IMPORT)
        module = self._expect(TokenType.IDENTIFIER).value
        while self._match(TokenType.DOT):
            self._advance()
            module += "." + self._expect(TokenType.IDENTIFIER).value
        alias: Optional[str] = None
        if self._match(TokenType.AS):
            self._advance()
            alias = self._expect(TokenType.IDENTIFIER).value
        return ImportStatement(module=module, alias=alias,
                               line=tok.line, col=tok.column)

    def _parse_from_import_stmt(self) -> FromImportStatement:
        tok = self._expect(TokenType.FROM)
        module = self._expect(TokenType.IDENTIFIER).value
        while self._match(TokenType.DOT):
            self._advance()
            module += "." + self._expect(TokenType.IDENTIFIER).value
        self._expect(TokenType.IMPORT)
        names: List[Tuple[str, Optional[str]]] = []
        while True:
            n = self._expect(TokenType.IDENTIFIER).value
            a: Optional[str] = None
            if self._match(TokenType.AS):
                self._advance()
                a = self._expect(TokenType.IDENTIFIER).value
            names.append((n, a))
            if not self._match(TokenType.COMMA):
                break
            self._advance()
        return FromImportStatement(module=module, names=names,
                                   line=tok.line, col=tok.column)

    def _parse_expr_statement(self) -> ExprStatement:
        tok = self._current()
        expr = self._parse_expr()
        return ExprStatement(expr=expr, line=tok.line, col=tok.column)

    # ── IGL-native statement parsers ──────────────────────────────────────────

    def _parse_identity_decl(self) -> IdentityDecl:
        tok = self._expect(TokenType.IDENTITY)
        name = self._expect(TokenType.IDENTIFIER).value
        self._expect(TokenType.LBRACE)
        self._skip_newlines()
        attrs: List[Tuple[str, Node]] = []
        while not self._match(TokenType.RBRACE) and not self._at_end():
            key_tok = self._current()
            # Allow keywords as attribute keys (e.g. trust:, role:)
            if key_tok.type == TokenType.IDENTIFIER or key_tok.type in KEYWORDS.values():
                key = key_tok.value if isinstance(key_tok.value, str) else key_tok.type.name.lower()
                self._advance()
            else:
                raise ParseError("Expected attribute key", key_tok)
            self._expect(TokenType.COLON)
            val = self._parse_expr()
            attrs.append((key, val))
            self._skip_terminators()
            # Allow comma separators between attributes
            if self._match(TokenType.COMMA):
                self._advance()
                self._skip_newlines()
        self._expect(TokenType.RBRACE)
        return IdentityDecl(name=name, attributes=attrs,
                            line=tok.line, col=tok.column)

    def _parse_reason_block(self) -> ReasonBlock:
        tok = self._expect(TokenType.REASON)
        label: Optional[str] = None
        if self._match(TokenType.IDENTIFIER):
            label = self._advance().value
        body = self._parse_block()
        return ReasonBlock(label=label, body=body,
                           line=tok.line, col=tok.column)

    def _parse_assert_reason(self) -> AssertReason:
        tok = self._expect(TokenType.ASSERT_REASON)
        cond = self._parse_expr()
        msg: Optional[Node] = None
        if self._match(TokenType.COLON):
            self._advance()
            msg = self._parse_expr()
        return AssertReason(condition=cond, message=msg,
                            line=tok.line, col=tok.column)

    def _parse_loop_close(self) -> LoopCloseStatement:
        tok = self._expect(TokenType.LOOP_CLOSE)
        expr = self._parse_expr()
        return LoopCloseStatement(expr=expr, line=tok.line, col=tok.column)

    def _parse_udm_block(self) -> UDMBlock:
        tok = self._expect(TokenType.UDM)
        name = self._expect(TokenType.IDENTIFIER).value
        body = self._parse_block()
        return UDMBlock(name=name, body=body, line=tok.line, col=tok.column)

    def _parse_drift_stmt(self) -> DriftStatement:
        tok = self._expect(TokenType.DRIFT)
        name = self._expect(TokenType.IDENTIFIER).value
        self._expect(TokenType.ASSIGN)
        tol = self._parse_expr()
        return DriftStatement(name=name, tolerance=tol,
                              line=tok.line, col=tok.column)

    def _parse_anchor_stmt(self) -> AnchorStatement:
        tok = self._expect(TokenType.ANCHOR)
        val = self._parse_expr()
        self._expect(TokenType.IN)
        self._expect(TokenType.AT)
        identity = self._expect(TokenType.IDENTIFIER).value
        return AnchorStatement(value=val, identity=identity,
                               line=tok.line, col=tok.column)

    def _parse_resolve_stmt(self) -> ResolveStatement:
        tok = self._expect(TokenType.RESOLVE)
        val = self._parse_expr()
        return ResolveStatement(value=val, line=tok.line, col=tok.column)

    def _parse_trust_stmt(self) -> TrustStatement:
        tok = self._expect(TokenType.TRUST)
        name = self._expect(TokenType.IDENTIFIER).value
        self._expect(TokenType.ASSIGN)
        score = self._parse_expr()
        return TrustStatement(name=name, score=score,
                              line=tok.line, col=tok.column)

    def _parse_verify_stmt(self) -> VerifyStatement:
        tok = self._expect(TokenType.VERIFY)
        self._expect(TokenType.AT)
        identity = self._expect(TokenType.IDENTIFIER).value
        msg: Optional[Node] = None
        if self._match(TokenType.COLON):
            self._advance()
            msg = self._parse_expr()
        return VerifyStatement(identity=identity, message=msg,
                               line=tok.line, col=tok.column)

    def _parse_frame_decl(self) -> FrameDecl:
        tok = self._expect(TokenType.FRAME)
        name = self._expect(TokenType.IDENTIFIER).value
        body = self._parse_block()
        return FrameDecl(name=name, body=body, line=tok.line, col=tok.column)

    def _parse_bind_stmt(self) -> BindStatement:
        tok = self._expect(TokenType.BIND)
        name = self._expect(TokenType.IDENTIFIER).value
        self._expect(TokenType.FAT_ARROW)
        self._expect(TokenType.AT)
        identity = self._expect(TokenType.IDENTIFIER).value
        return BindStatement(name=name, identity=identity,
                             line=tok.line, col=tok.column)

    def _parse_unbind_stmt(self) -> UnbindStatement:
        tok = self._expect(TokenType.UNBIND)
        name = self._expect(TokenType.IDENTIFIER).value
        return UnbindStatement(name=name, line=tok.line, col=tok.column)

    def _parse_propagate_stmt(self) -> PropagateStatement:
        tok = self._expect(TokenType.PROPAGATE)
        self._expect(TokenType.AT)
        source = self._expect(TokenType.IDENTIFIER).value
        self._expect(TokenType.ARROW)
        self._expect(TokenType.AT)
        target = self._expect(TokenType.IDENTIFIER).value
        return PropagateStatement(source=source, target=target,
                                  line=tok.line, col=tok.column)

    def _parse_emit_stmt(self) -> ExprStatement:
        tok = self._advance()   # consume 'emit'
        val = self._parse_expr()
        return ExprStatement(
            expr=EmitExpr(value=val, line=tok.line, col=tok.column),
            line=tok.line, col=tok.column,
        )

    # ── Expression parsing (Pratt / precedence climbing) ──────────────────────

    def _parse_expr(self) -> Node:
        return self._parse_assignment()

    def _parse_assignment(self) -> Node:
        expr = self._parse_or()
        assign_ops = {
            TokenType.ASSIGN: "=",
            TokenType.PLUS_ASSIGN: "+=",
            TokenType.MINUS_ASSIGN: "-=",
            TokenType.STAR_ASSIGN: "*=",
            TokenType.SLASH_ASSIGN: "/=",
            TokenType.PERCENT_ASSIGN: "%=",
        }
        if self._current().type in assign_ops:
            op_tok = self._advance()
            op = assign_ops[op_tok.type]
            right = self._parse_assignment()
            name = expr.name if isinstance(expr, Identifier) else None
            if name is None:
                raise ParseError("Invalid assignment target", op_tok)
            return Assign(name=name, op=op, value=right,
                          line=op_tok.line, col=op_tok.column)
        return expr

    def _parse_or(self) -> Node:
        left = self._parse_and()
        while self._match(TokenType.OR):
            op = self._advance().value
            right = self._parse_and()
            left = BinaryOp(op="or", left=left, right=right,
                            line=left.line, col=left.col)
        return left

    def _parse_and(self) -> Node:
        left = self._parse_not()
        while self._match(TokenType.AND):
            self._advance()
            right = self._parse_not()
            left = BinaryOp(op="and", left=left, right=right,
                            line=left.line, col=left.col)
        return left

    def _parse_not(self) -> Node:
        if self._match(TokenType.NOT):
            tok = self._advance()
            operand = self._parse_not()
            return UnaryOp(op="not", operand=operand,
                           line=tok.line, col=tok.column)
        return self._parse_comparison()

    def _parse_comparison(self) -> Node:
        left = self._parse_arrow_pipe()
        cmp_ops = {
            TokenType.EQ: "==",
            TokenType.NEQ: "!=",
            TokenType.LT: "<",
            TokenType.GT: ">",
            TokenType.LTE: "<=",
            TokenType.GTE: ">=",
            TokenType.TILDE_EQ: "~=",
        }
        while self._current().type in cmp_ops:
            op_tok = self._advance()
            op = cmp_ops[op_tok.type]
            right = self._parse_arrow_pipe()
            if op == "~=":
                left = DriftEquality(left=left, right=right, tolerance=None,
                                     line=op_tok.line, col=op_tok.column)
            else:
                left = BinaryOp(op=op, left=left, right=right,
                                line=op_tok.line, col=op_tok.column)
        return left

    def _parse_arrow_pipe(self) -> Node:
        left = self._parse_addition()
        while self._match(TokenType.ARROW):
            tok = self._advance()
            right = self._parse_addition()
            left = ArrowPipe(left=left, right=right,
                             line=tok.line, col=tok.column)
        return left

    def _parse_addition(self) -> Node:
        left = self._parse_multiplication()
        while self._match(TokenType.PLUS, TokenType.MINUS):
            op = self._advance().value
            right = self._parse_multiplication()
            left = BinaryOp(op=op, left=left, right=right,
                            line=left.line, col=left.col)
        return left

    def _parse_multiplication(self) -> Node:
        left = self._parse_unary()
        while self._match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT,
                          TokenType.STAR_STAR):
            op = self._advance().value
            right = self._parse_unary()
            left = BinaryOp(op=op, left=left, right=right,
                            line=left.line, col=left.col)
        return left

    def _parse_unary(self) -> Node:
        if self._match(TokenType.MINUS):
            tok = self._advance()
            return UnaryOp(op="-", operand=self._parse_unary(),
                           line=tok.line, col=tok.column)
        if self._match(TokenType.TILDE):
            tok = self._advance()
            return UnaryOp(op="~", operand=self._parse_unary(),
                           line=tok.line, col=tok.column)
        return self._parse_call()

    def _parse_call(self) -> Node:
        expr = self._parse_primary()
        while True:
            if self._match(TokenType.LPAREN):
                tok = self._advance()
                args, kwargs = self._parse_args()
                self._expect(TokenType.RPAREN)
                expr = Call(callee=expr, args=args, kwargs=kwargs,
                            line=tok.line, col=tok.column)
            elif self._match(TokenType.DOT):
                self._advance()
                # Allow keywords to be used as attribute names (e.g. obj.trust)
                attr_tok = self._current()
                if attr_tok.type == TokenType.IDENTIFIER or attr_tok.type in KEYWORDS.values():
                    attr = attr_tok.value if isinstance(attr_tok.value, str) else attr_tok.type.name.lower()
                    self._advance()
                else:
                    raise ParseError("Expected attribute name", attr_tok)
                expr = AttributeAccess(obj=expr, attr=attr,
                                       line=expr.line, col=expr.col)
            elif self._match(TokenType.LBRACKET):
                tok = self._advance()
                idx = self._parse_expr()
                self._expect(TokenType.RBRACKET)
                expr = IndexAccess(obj=expr, index=idx,
                                   line=tok.line, col=tok.column)
            else:
                break
        return expr

    def _parse_args(self) -> Tuple[List[Node], List[Tuple[str, Node]]]:
        args: List[Node] = []
        kwargs: List[Tuple[str, Node]] = []
        while not self._match(TokenType.RPAREN) and not self._at_end():
            # kwarg: name=expr
            if (self._current().type == TokenType.IDENTIFIER
                    and self._peek().type == TokenType.ASSIGN):
                name = self._advance().value
                self._advance()  # '='
                val = self._parse_expr()
                kwargs.append((name, val))
            else:
                args.append(self._parse_expr())
            if not self._match(TokenType.RPAREN):
                self._expect(TokenType.COMMA)
        return args, kwargs

    def _parse_primary(self) -> Node:  # noqa: C901
        tok = self._current()

        # Literals
        if tok.type == TokenType.INTEGER:
            self._advance()
            return IntegerLiteral(value=tok.value, line=tok.line, col=tok.column)
        if tok.type == TokenType.FLOAT:
            self._advance()
            return FloatLiteral(value=tok.value, line=tok.line, col=tok.column)
        if tok.type == TokenType.STRING:
            self._advance()
            return StringLiteral(value=tok.value, line=tok.line, col=tok.column)
        if tok.type == TokenType.BOOL:
            self._advance()
            return BoolLiteral(value=tok.value, line=tok.line, col=tok.column)
        if tok.type == TokenType.NULL:
            self._advance()
            return NullLiteral(line=tok.line, col=tok.column)

        # Identifier (with possible frame::member)
        if tok.type == TokenType.IDENTIFIER:
            self._advance()
            if self._match(TokenType.COLON_COLON):
                self._advance()
                member = self._expect(TokenType.IDENTIFIER).value
                return FrameScopeRef(frame=tok.value, member=member,
                                     line=tok.line, col=tok.column)
            return Identifier(name=tok.value, line=tok.line, col=tok.column)

        # Identity reference: @name
        if tok.type == TokenType.AT:
            self._advance()
            name = self._expect(TokenType.IDENTIFIER).value
            return IdentityRef(name=name, line=tok.line, col=tok.column)

        # Trust annotation: #! <score> <expr>
        if tok.type == TokenType.HASH_BANG:
            self._advance()
            score_tok = self._current()
            if score_tok.type in (TokenType.FLOAT, TokenType.INTEGER):
                score = float(self._advance().value)
            else:
                raise ParseError("Expected numeric trust score after #!", score_tok)
            expr = self._parse_primary()
            return TrustAnnotation(score=score, expr=expr,
                                   line=tok.line, col=tok.column)

        # Emit expression
        if tok.type == TokenType.EMIT:
            self._advance()
            val = self._parse_expr()
            return EmitExpr(value=val, line=tok.line, col=tok.column)

        # List literal
        if tok.type == TokenType.LBRACKET:
            self._advance()
            elements: List[Node] = []
            while not self._match(TokenType.RBRACKET) and not self._at_end():
                elements.append(self._parse_expr())
                if not self._match(TokenType.RBRACKET):
                    self._expect(TokenType.COMMA)
            self._expect(TokenType.RBRACKET)
            return ListLiteral(elements=elements, line=tok.line, col=tok.column)

        # Dict literal
        if tok.type == TokenType.LBRACE:
            self._advance()
            self._skip_newlines()
            pairs: List[Tuple[Node, Node]] = []
            while not self._match(TokenType.RBRACE) and not self._at_end():
                key = self._parse_expr()
                self._expect(TokenType.COLON)
                val = self._parse_expr()
                pairs.append((key, val))
                self._skip_newlines()
                if not self._match(TokenType.RBRACE):
                    self._expect(TokenType.COMMA)
                    self._skip_newlines()
            self._expect(TokenType.RBRACE)
            return DictLiteral(pairs=pairs, line=tok.line, col=tok.column)

        # Grouped expression
        if tok.type == TokenType.LPAREN:
            self._advance()
            expr = self._parse_expr()
            self._expect(TokenType.RPAREN)
            return expr

        raise ParseError("Expected expression", tok)
