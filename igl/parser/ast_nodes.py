"""
IGL Abstract Syntax Tree node definitions.

Each node class represents a syntactic construct in IGL source code.
Nodes are plain data classes – no execution logic lives here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional, Tuple


# ── Base ──────────────────────────────────────────────────────────────────────

@dataclass
class Node:
    """Base class for all AST nodes."""
    line: int = field(default=0, repr=False, kw_only=True)
    col: int = field(default=0, repr=False, kw_only=True)


# ── Expressions ───────────────────────────────────────────────────────────────

@dataclass
class IntegerLiteral(Node):
    value: int


@dataclass
class FloatLiteral(Node):
    value: float


@dataclass
class StringLiteral(Node):
    value: str


@dataclass
class BoolLiteral(Node):
    value: bool


@dataclass
class NullLiteral(Node):
    pass


@dataclass
class Identifier(Node):
    name: str


@dataclass
class ListLiteral(Node):
    elements: List[Node]


@dataclass
class DictLiteral(Node):
    pairs: List[Tuple[Node, Node]]


@dataclass
class BinaryOp(Node):
    op: str
    left: Node
    right: Node


@dataclass
class UnaryOp(Node):
    op: str
    operand: Node


@dataclass
class Assign(Node):
    name: str
    op: str         # "=" | "+=" | "-=" | "*=" | "/=" | "%="
    value: Node


@dataclass
class AttributeAccess(Node):
    obj: Node
    attr: str


@dataclass
class IndexAccess(Node):
    obj: Node
    index: Node


@dataclass
class Call(Node):
    callee: Node
    args: List[Node]
    kwargs: List[Tuple[str, Node]]


@dataclass
class Lambda(Node):
    params: List[str]
    body: Node


# ── IGL-native expressions ────────────────────────────────────────────────────

@dataclass
class IdentityRef(Node):
    """@name  –  reference to an identity frame by name."""
    name: str


@dataclass
class FrameScopeRef(Node):
    """frame::member  –  access a member inside a named frame."""
    frame: str
    member: str


@dataclass
class TrustAnnotation(Node):
    """#! <score>  –  attach a confidence score to an expression."""
    score: float
    expr: Node


@dataclass
class DriftEquality(Node):
    """left ~= right  –  equality within a drift (tolerance) range."""
    left: Node
    right: Node
    tolerance: Optional[Node]   # optional explicit drift value


@dataclass
class EmitExpr(Node):
    """emit <expr>  –  emit a value from a reasoning context."""
    value: Node


@dataclass
class ArrowPipe(Node):
    """left -> right  –  pipe a value into a function / continuation."""
    left: Node
    right: Node


# ── Statements ────────────────────────────────────────────────────────────────

@dataclass
class Block(Node):
    statements: List[Node]


@dataclass
class ExprStatement(Node):
    expr: Node


@dataclass
class LetStatement(Node):
    name: str
    mutable: bool       # let = mutable, const = immutable
    value: Node


@dataclass
class IfStatement(Node):
    condition: Node
    then_block: Block
    elif_clauses: List[Tuple[Node, Block]]
    else_block: Optional[Block]


@dataclass
class WhileStatement(Node):
    condition: Node
    body: Block


@dataclass
class ForStatement(Node):
    target: str
    iterable: Node
    body: Block


@dataclass
class ReturnStatement(Node):
    value: Optional[Node]


@dataclass
class BreakStatement(Node):
    pass


@dataclass
class ContinueStatement(Node):
    pass


@dataclass
class FunctionDef(Node):
    name: str
    params: List[str]
    defaults: List[Optional[Node]]
    body: Block


@dataclass
class ImportStatement(Node):
    module: str
    alias: Optional[str]


@dataclass
class FromImportStatement(Node):
    module: str
    names: List[Tuple[str, Optional[str]]]   # (name, alias)


# ── IGL-native statements ─────────────────────────────────────────────────────

@dataclass
class IdentityDecl(Node):
    """
    identity <name> {
        ...key: value pairs...
    }
    Declares an identity frame – a named, typed context that governs
    downstream computations.
    """
    name: str
    attributes: List[Tuple[str, Node]]


@dataclass
class ReasonBlock(Node):
    """
    reason [<label>] {
        ...statements...
        resolve <expr>
    }
    An explicit reasoning region whose result must be resolved.
    """
    label: Optional[str]
    body: Block


@dataclass
class AssertReason(Node):
    """assert_reason <expr> [: <message>]"""
    condition: Node
    message: Optional[Node]


@dataclass
class LoopCloseStatement(Node):
    """
    loop_close <expr>
    Declares that the computation converges (closes the loop).
    """
    expr: Node


@dataclass
class UDMBlock(Node):
    """
    udm <name> {
        ...deterministic computation steps...
    }
    A Universal Deterministic Model block – guarantees referential
    transparency and determinism within its scope.
    """
    name: str
    body: Block


@dataclass
class DriftStatement(Node):
    """drift <name> = <tolerance>"""
    name: str
    tolerance: Node


@dataclass
class AnchorStatement(Node):
    """anchor <expr> to @<identity>"""
    value: Node
    identity: str


@dataclass
class ResolveStatement(Node):
    """resolve <expr>"""
    value: Node


@dataclass
class TrustStatement(Node):
    """trust <name> = <score>"""
    name: str
    score: Node


@dataclass
class VerifyStatement(Node):
    """verify @<identity> [: <message>]"""
    identity: str
    message: Optional[Node]


@dataclass
class FrameDecl(Node):
    """
    frame <name> {
        ...statements...
    }
    A bounded context window that scopes identity attributes.
    """
    name: str
    body: Block


@dataclass
class BindStatement(Node):
    """bind <name> => @<identity>"""
    name: str
    identity: str


@dataclass
class UnbindStatement(Node):
    """unbind <name>"""
    name: str


@dataclass
class PropagateStatement(Node):
    """propagate @<source> -> @<target>"""
    source: str
    target: str


@dataclass
class Program(Node):
    """Root of the AST."""
    body: List[Node]
