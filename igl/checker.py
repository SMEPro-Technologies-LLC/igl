"""
IGL Static Checker – AST-level enforcement of closed-loop guarantees.

Checks performed (all are errors that block execution):

1. **UDM effect check** – ``print`` calls and ``emit`` expressions inside a
   ``udm`` block are forbidden; UDM blocks must be pure/deterministic.

2. **UDM loop-close obligation** – every ``udm`` block must contain at least
   one ``resolve`` or ``loop_close`` statement so the loop is always closed
   by construction.

A companion runtime check (enforced in the standard-library ``unwrap``
built-in) ensures that ``unwrap()`` may only be called on trust-annotated
(``IGLTrustedValue``) or UDM-computed (``IGLUDMResult``) values, preventing
raw unvalidated values from silently escaping the trust boundary.

The checker is designed to be run *after* parsing and *before* interpretation
so that violations become compile-time errors rather than silent runtime
surprises.
"""

from __future__ import annotations

import dataclasses
from typing import Any, List

from .parser.ast_nodes import (
    Node, Program, Block,
    UDMBlock, EmitExpr, Call, Identifier, TrustAnnotation,
    ResolveStatement, LoopCloseStatement,
)


# ── Error type ────────────────────────────────────────────────────────────────

class StaticCheckError(Exception):
    """Raised when the static checker detects a closed-loop violation."""

    def __init__(self, message: str, line: int = 0, col: int = 0,
                 filename: str = "<igl>"):
        super().__init__(f"{filename}:{line}:{col}: {message}")
        self.line = line
        self.col = col
        self.filename = filename


# ── Helpers ───────────────────────────────────────────────────────────────────

def _iter_child_nodes(node: Node):
    """Yield direct child AST nodes of *node* using dataclass field introspection."""
    for f in dataclasses.fields(node):
        value = getattr(node, f.name)
        if isinstance(value, Node):
            yield value
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, Node):
                    yield item
        elif isinstance(value, tuple):
            for item in value:
                if isinstance(item, Node):
                    yield item


def _block_has_close(block: Block) -> bool:
    """Return True if *block* contains a resolve or loop_close (shallow walk,
    does not cross nested UDMBlock boundaries)."""
    for stmt in block.statements:
        if _subtree_has_close(stmt):
            return True
    return False


def _subtree_has_close(node: Node) -> bool:
    """Recursively check for ResolveStatement / LoopCloseStatement, stopping
    at nested UDMBlock boundaries (they have their own obligations)."""
    if isinstance(node, (ResolveStatement, LoopCloseStatement)):
        return True
    if isinstance(node, UDMBlock):
        # Nested UDM: don't recurse – its close belongs to it, not the parent
        return False
    for child in _iter_child_nodes(node):
        if _subtree_has_close(child):
            return True
    return False


# ── Checker ───────────────────────────────────────────────────────────────────

# Built-in names that produce observable side-effects in the host environment.
_SIDE_EFFECT_BUILTINS: frozenset[str] = frozenset({"print", "emit"})


class StaticChecker:
    """
    Walk an IGL AST and collect closed-loop static-check violations.

    Usage::

        checker = StaticChecker(filename)
        errors  = checker.check(ast)
        if errors:
            raise errors[0]   # or report all

    The checker does *not* mutate the AST.
    """

    def __init__(self, filename: str = "<igl>"):
        self._filename = filename
        self._errors: List[StaticCheckError] = []

    # ── Public API ────────────────────────────────────────────────────────────

    def check(self, ast: Program) -> List[StaticCheckError]:
        """Return all static check errors found in *ast* (may be empty)."""
        self._errors = []
        self._walk(ast, in_udm=False)
        return list(self._errors)

    # ── Internal walk ─────────────────────────────────────────────────────────

    def _walk(self, node: Node, in_udm: bool) -> None:  # noqa: C901
        t = type(node)

        if t is UDMBlock:
            # ── obligation: every udm block must close the loop ────────────
            if not _block_has_close(node.body):
                self._err(
                    f"udm '{node.name}' never resolves or closes the loop: "
                    "add 'resolve <expr>' or 'loop_close <expr>'",
                    node,
                )
            # Recurse into body with in_udm=True
            self._walk(node.body, in_udm=True)
            return

        if in_udm:
            # ── effect check: no side-effecting calls ─────────────────────
            if t is EmitExpr:
                self._err(
                    "'emit' is a side-effecting operation and is not allowed "
                    "inside a udm block",
                    node,
                )
            if t is Call and isinstance(node.callee, Identifier):
                if node.callee.name in _SIDE_EFFECT_BUILTINS:
                    self._err(
                        f"'{node.callee.name}()' is a side-effecting operation "
                        "and is not allowed inside a udm block",
                        node,
                    )

        # Recurse into children
        for child in _iter_child_nodes(node):
            self._walk(child, in_udm)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _err(self, message: str, node: Node) -> None:
        self._errors.append(
            StaticCheckError(message, node.line, node.col, self._filename)
        )


# ── Convenience function ──────────────────────────────────────────────────────

def check_ast(ast: Program, filename: str = "<igl>") -> List[StaticCheckError]:
    """Run all static checks on *ast* and return any errors found."""
    return StaticChecker(filename).check(ast)
