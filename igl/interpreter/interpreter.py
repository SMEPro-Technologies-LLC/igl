"""
IGL Interpreter – tree-walk evaluation of IGL AST nodes.

The interpreter implements the semantics of IGL including:
* Standard control flow (if/while/for/functions)
* Identity frame management
* Reason blocks with resolve/assert_reason
* UDM deterministic computation
* Drift equality (~=)
* Trust annotations
* Arrow piping (->)
"""

from __future__ import annotations

import math
import operator
from typing import Any, Optional

from ..parser.ast_nodes import (
    Node, Program, Block, ExprStatement, LetStatement, IfStatement,
    WhileStatement, ForStatement, ReturnStatement, BreakStatement,
    ContinueStatement, FunctionDef, ImportStatement, FromImportStatement,
    IntegerLiteral, FloatLiteral, StringLiteral, BoolLiteral, NullLiteral,
    Identifier, ListLiteral, DictLiteral, BinaryOp, UnaryOp, Assign,
    AttributeAccess, IndexAccess, Call, Lambda,
    IdentityRef, FrameScopeRef, TrustAnnotation, DriftEquality,
    EmitExpr, ArrowPipe,
    IdentityDecl, ReasonBlock, AssertReason, LoopCloseStatement,
    UDMBlock, DriftStatement, AnchorStatement, ResolveStatement,
    TrustStatement, VerifyStatement, FrameDecl, BindStatement,
    UnbindStatement, PropagateStatement,
)
from .runtime import (
    Environment, IGLFunction, IGLBuiltin, IGLIdentity, IGLFrame,
    IGLTrustedValue, IGLUDMResult,
    _ReturnSignal, _BreakSignal, _ContinueSignal,
    IGLRuntimeError, IGLReasonError, IGLIdentityError,
)
from ..stdlib import load_stdlib


class _ResolveSignal(Exception):
    """Internal signal used to return a value from a reason block."""
    def __init__(self, value: Any):
        self.value = value


class Interpreter:
    """
    Tree-walk interpreter for IGL.

    Usage::

        interp = Interpreter()
        result = interp.evaluate(ast)
    """

    def __init__(self, filename: str = "<igl>"):
        self._filename = filename
        self._global_env = Environment()
        load_stdlib(self._global_env)

    # ── Public API ────────────────────────────────────────────────────────────

    def evaluate(self, node: Node, env: Optional[Environment] = None) -> Any:
        """Evaluate an AST node in the given environment."""
        if env is None:
            env = self._global_env
        try:
            return self._eval(node, env)
        except _ResolveSignal as r:
            return r.value

    # ── Dispatch ──────────────────────────────────────────────────────────────

    def _eval(self, node: Node, env: Environment) -> Any:  # noqa: C901
        t = type(node)

        # Literals
        if t is IntegerLiteral:
            return node.value
        if t is FloatLiteral:
            return node.value
        if t is StringLiteral:
            return node.value
        if t is BoolLiteral:
            return node.value
        if t is NullLiteral:
            return None

        # Structural
        if t is Program:
            return self._eval_block_stmts(node.body, env)
        if t is Block:
            child = env.child()
            return self._eval_block_stmts(node.statements, child)
        if t is ExprStatement:
            return self._eval(node.expr, env)

        # Variables
        if t is Identifier:
            return self._resolve_name(node.name, env, node)
        if t is LetStatement:
            val = self._eval(node.value, env)
            env.define(node.name, val, const=not node.mutable)
            return val
        if t is Assign:
            return self._eval_assign(node, env)

        # Operators
        if t is BinaryOp:
            return self._eval_binary(node, env)
        if t is UnaryOp:
            return self._eval_unary(node, env)

        # Collections
        if t is ListLiteral:
            return [self._eval(e, env) for e in node.elements]
        if t is DictLiteral:
            return {self._eval(k, env): self._eval(v, env) for k, v in node.pairs}

        # Member access
        if t is AttributeAccess:
            obj = self._eval(node.obj, env)
            return self._get_attr(obj, node.attr, node)
        if t is IndexAccess:
            obj = self._eval(node.obj, env)
            idx = self._eval(node.index, env)
            try:
                return obj[idx]
            except (KeyError, IndexError, TypeError) as e:
                raise IGLRuntimeError(str(e), node.line, node.col, self._filename)

        # Calls
        if t is Call:
            return self._eval_call(node, env)

        # Control flow
        if t is IfStatement:
            return self._eval_if(node, env)
        if t is WhileStatement:
            return self._eval_while(node, env)
        if t is ForStatement:
            return self._eval_for(node, env)
        if t is ReturnStatement:
            val = self._eval(node.value, env) if node.value else None
            raise _ReturnSignal(val)
        if t is BreakStatement:
            raise _BreakSignal()
        if t is ContinueStatement:
            raise _ContinueSignal()

        # Functions
        if t is FunctionDef:
            fn = IGLFunction(name=node.name, params=node.params,
                             defaults=[self._eval(d, env) if d else None
                                       for d in node.defaults],
                             body=node.body, closure=env)
            env.define(node.name, fn)
            return fn

        # Imports
        if t is ImportStatement:
            return self._eval_import(node, env)
        if t is FromImportStatement:
            return self._eval_from_import(node, env)

        # IGL-native expressions
        if t is IdentityRef:
            return env.get_identity(node.name)
        if t is FrameScopeRef:
            frame = env.get_frame(node.frame)
            return frame.env.get(node.member)
        if t is TrustAnnotation:
            val = self._eval(node.expr, env)
            return IGLTrustedValue(value=val, score=node.score)
        if t is DriftEquality:
            return self._eval_drift_eq(node, env)
        if t is EmitExpr:
            return self._eval(node.value, env)
        if t is ArrowPipe:
            return self._eval_arrow_pipe(node, env)

        # IGL-native statements
        if t is IdentityDecl:
            return self._eval_identity_decl(node, env)
        if t is ReasonBlock:
            return self._eval_reason_block(node, env)
        if t is AssertReason:
            return self._eval_assert_reason(node, env)
        if t is LoopCloseStatement:
            val = self._eval(node.expr, env)
            raise _ResolveSignal(val)
        if t is UDMBlock:
            return self._eval_udm_block(node, env)
        if t is DriftStatement:
            tol = float(self._eval(node.tolerance, env))
            env.set_drift(node.name, tol)
            return tol
        if t is AnchorStatement:
            val = self._eval(node.value, env)
            identity = env.get_identity(node.identity)
            identity.bindings["__anchor__"] = val
            return val
        if t is ResolveStatement:
            val = self._eval(node.value, env)
            raise _ResolveSignal(val)
        if t is TrustStatement:
            score = float(self._eval(node.score, env))
            try:
                obj = env.get(node.name)
                if isinstance(obj, IGLIdentity):
                    obj.trust = score
                else:
                    env.set_or_define(node.name, IGLTrustedValue(obj, score))
            except IGLRuntimeError:
                env.define(node.name, score)
            return score
        if t is VerifyStatement:
            return self._eval_verify(node, env)
        if t is FrameDecl:
            return self._eval_frame_decl(node, env)
        if t is BindStatement:
            identity = env.get_identity(node.identity)
            val = env.get(node.name)
            identity.bindings[node.name] = val
            return val
        if t is UnbindStatement:
            try:
                obj = env.get(node.name)
                if isinstance(obj, IGLIdentity):
                    obj.bindings.clear()
            except IGLRuntimeError:
                pass
            return None
        if t is PropagateStatement:
            src = env.get_identity(node.source)
            tgt = env.get_identity(node.target)
            tgt.attributes.update(src.attributes)
            tgt.trust = min(tgt.trust, src.trust)
            return tgt

        raise IGLRuntimeError(
            f"Unknown AST node type: {t.__name__}",
            getattr(node, "line", 0), getattr(node, "col", 0), self._filename
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _eval_block_stmts(self, stmts: list, env: Environment) -> Any:
        result = None
        for stmt in stmts:
            result = self._eval(stmt, env)
        return result

    def _resolve_name(self, name: str, env: Environment, node: Node) -> Any:
        try:
            return env.get(name)
        except IGLRuntimeError:
            raise IGLRuntimeError(
                f"Name '{name}' is not defined",
                node.line, node.col, self._filename
            )

    def _eval_assign(self, node: Assign, env: Environment) -> Any:
        val = self._eval(node.value, env)
        if node.op == "=":
            try:
                env.assign(node.name, val)
            except IGLRuntimeError as e:
                # Re-raise const errors; only define for truly-new names
                if "const" in str(e).lower():
                    raise
                env.define(node.name, val)
        else:
            current = env.get(node.name)
            ops = {
                "+=": operator.add, "-=": operator.sub,
                "*=": operator.mul, "/=": operator.truediv,
                "%=": operator.mod,
            }
            val = ops[node.op](current, val)
            env.assign(node.name, val)
        return val

    def _eval_binary(self, node: BinaryOp, env: Environment) -> Any:  # noqa: C901
        op = node.op
        # Short-circuit
        if op == "and":
            left = self._eval(node.left, env)
            return left and self._eval(node.right, env)
        if op == "or":
            left = self._eval(node.left, env)
            return left or self._eval(node.right, env)

        left = self._eval(node.left, env)
        right = self._eval(node.right, env)

        # Unwrap trusted values for arithmetic
        if isinstance(left, IGLTrustedValue):
            left = left.value
        if isinstance(right, IGLTrustedValue):
            right = right.value

        try:
            match op:
                case "+":  return left + right
                case "-":  return left - right
                case "*":  return left * right
                case "/":
                    if right == 0:
                        raise IGLRuntimeError(
                            "Division by zero", node.line, node.col, self._filename
                        )
                    return left / right
                case "//": return left // right
                case "%":  return left % right
                case "**": return left ** right
                case "==": return left == right
                case "!=": return left != right
                case "<":  return left < right
                case ">":  return left > right
                case "<=": return left <= right
                case ">=": return left >= right
                case "&":  return left & right
                case "|":  return left | right
                case "^":  return left ^ right
                case "<<": return left << right
                case ">>": return left >> right
                case _:
                    raise IGLRuntimeError(
                        f"Unknown operator '{op}'",
                        node.line, node.col, self._filename
                    )
        except (TypeError, ValueError) as e:
            raise IGLRuntimeError(str(e), node.line, node.col, self._filename)

    def _eval_unary(self, node: UnaryOp, env: Environment) -> Any:
        val = self._eval(node.operand, env)
        if isinstance(val, IGLTrustedValue):
            val = val.value
        match node.op:
            case "-":   return -val
            case "not": return not val
            case "~":   return ~val
            case _:
                raise IGLRuntimeError(
                    f"Unknown unary op '{node.op}'",
                    node.line, node.col, self._filename
                )

    def _get_attr(self, obj: Any, attr: str, node: Node) -> Any:
        if isinstance(obj, IGLIdentity):
            if attr in obj.attributes:
                return obj.attributes[attr]
            if attr in obj.bindings:
                return obj.bindings[attr]
            if attr == "trust":
                return obj.trust
            if attr == "name":
                return obj.name
        if isinstance(obj, IGLFrame):
            return obj.env.get(attr)
        if isinstance(obj, IGLTrustedValue):
            if attr == "value":
                return obj.value
            if attr == "score":
                return obj.score
        if isinstance(obj, dict):
            if attr in obj:
                return obj[attr]
        # Fall back to Python attribute access for built-ins
        try:
            return getattr(obj, attr)
        except AttributeError:
            raise IGLRuntimeError(
                f"'{type(obj).__name__}' has no attribute '{attr}'",
                node.line, node.col, self._filename
            )

    def _eval_call(self, node: Call, env: Environment) -> Any:
        callee = self._eval(node.callee, env)
        args = [self._eval(a, env) for a in node.args]
        kwargs = {k: self._eval(v, env) for k, v in node.kwargs}

        if isinstance(callee, IGLBuiltin):
            try:
                return callee.fn(*args, **kwargs)
            except IGLRuntimeError:
                raise
            except Exception as e:
                raise IGLRuntimeError(str(e), node.line, node.col, self._filename)

        if isinstance(callee, IGLFunction):
            return self._call_function(callee, args, kwargs, node)

        # Allow calling Python callables (from stdlib)
        if callable(callee):
            try:
                return callee(*args, **kwargs)
            except Exception as e:
                raise IGLRuntimeError(str(e), node.line, node.col, self._filename)

        raise IGLRuntimeError(
            f"'{type(callee).__name__}' is not callable",
            node.line, node.col, self._filename
        )

    def _call_function(self, fn: IGLFunction, args: list, kwargs: dict,
                       node: Node) -> Any:
        call_env = fn.closure.child()
        for i, param in enumerate(fn.params):
            if i < len(args):
                call_env.define(param, args[i])
            elif param in kwargs:
                call_env.define(param, kwargs[param])
            elif fn.defaults[i] is not None:
                call_env.define(param, fn.defaults[i])
            else:
                raise IGLRuntimeError(
                    f"Missing argument '{param}'",
                    node.line, node.col, self._filename
                )
        try:
            return self._eval(fn.body, call_env)
        except _ReturnSignal as ret:
            return ret.value

    def _eval_if(self, node: IfStatement, env: Environment) -> Any:
        if self._is_truthy(self._eval(node.condition, env)):
            return self._eval(node.then_block, env)
        for cond, block in node.elif_clauses:
            if self._is_truthy(self._eval(cond, env)):
                return self._eval(block, env)
        if node.else_block:
            return self._eval(node.else_block, env)
        return None

    def _eval_while(self, node: WhileStatement, env: Environment) -> Any:
        result = None
        while self._is_truthy(self._eval(node.condition, env)):
            try:
                result = self._eval(node.body, env)
            except _BreakSignal:
                break
            except _ContinueSignal:
                continue
        return result

    def _eval_for(self, node: ForStatement, env: Environment) -> Any:
        iterable = self._eval(node.iterable, env)
        result = None
        for item in iterable:
            loop_env = env.child()
            loop_env.define(node.target, item)
            try:
                result = self._eval(node.body, loop_env)
            except _BreakSignal:
                break
            except _ContinueSignal:
                continue
        return result

    def _eval_import(self, node: ImportStatement, env: Environment) -> Any:
        mod = self._load_module(node.module, node)
        alias = node.alias or node.module.split(".")[-1]
        env.define(alias, mod)
        return mod

    def _eval_from_import(self, node: FromImportStatement, env: Environment) -> Any:
        mod = self._load_module(node.module, node)
        for name, alias in node.names:
            if isinstance(mod, dict):
                val = mod.get(name)
            else:
                try:
                    val = getattr(mod, name)
                except AttributeError:
                    raise IGLRuntimeError(
                        f"Module '{node.module}' has no member '{name}'",
                        node.line, node.col, self._filename
                    )
            env.define(alias or name, val)
        return None

    def _load_module(self, module_name: str, node: Node) -> Any:
        from ..stdlib import get_module
        mod = get_module(module_name)
        if mod is None:
            raise IGLRuntimeError(
                f"Module '{module_name}' not found",
                node.line, node.col, self._filename
            )
        return mod

    # ── IGL-native evaluation ─────────────────────────────────────────────────

    def _eval_identity_decl(self, node: IdentityDecl, env: Environment) -> IGLIdentity:
        attrs = {k: self._eval(v, env) for k, v in node.attributes}
        identity = IGLIdentity(name=node.name, attributes=attrs)
        env.register_identity(identity)
        return identity

    def _eval_reason_block(self, node: ReasonBlock, env: Environment) -> Any:
        reason_env = env.child()
        result = None
        try:
            self._eval(node.body, reason_env)
        except _ResolveSignal as r:
            result = r.value
        # If labelled, store the result in the enclosing scope
        if node.label:
            env.define(node.label, result)
        return result

    def _eval_assert_reason(self, node: AssertReason, env: Environment) -> Any:
        cond = self._eval(node.condition, env)
        if not self._is_truthy(cond):
            msg = ""
            if node.message:
                msg = str(self._eval(node.message, env))
            raise IGLReasonError(
                f"assert_reason failed: {msg}" if msg else "assert_reason failed",
                node.line, node.col, self._filename
            )
        return True

    def _eval_udm_block(self, node: UDMBlock, env: Environment) -> IGLUDMResult:
        udm_env = env.child(udm_mode=True)
        try:
            val = self._eval(node.body, udm_env)
        except _ResolveSignal as r:
            val = r.value
        result = IGLUDMResult(name=node.name, value=val)
        # Store the result under the UDM block name
        env.define(node.name, result)
        return result

    def _eval_verify(self, node: VerifyStatement, env: Environment) -> bool:
        identity = env.get_identity(node.identity)
        if not identity.verify():
            msg = ""
            if node.message:
                msg = str(self._eval(node.message, env))
            raise IGLIdentityError(
                f"Identity '@{node.identity}' verification failed: {msg}"
                if msg else f"Identity '@{node.identity}' verification failed",
                node.line, node.col, self._filename
            )
        return True

    def _eval_frame_decl(self, node: FrameDecl, env: Environment) -> IGLFrame:
        frame_env = env.child()
        # Evaluate block statements directly in frame_env (not a nested child)
        self._eval_block_stmts(node.body.statements, frame_env)
        frame = IGLFrame(name=node.name, env=frame_env)
        env.register_frame(frame)
        return frame

    def _eval_drift_eq(self, node: DriftEquality, env: Environment) -> bool:
        left = self._eval(node.left, env)
        right = self._eval(node.right, env)
        if isinstance(left, IGLTrustedValue):
            left = left.value
        if isinstance(right, IGLTrustedValue):
            right = right.value
        tol = 1e-9
        if node.tolerance:
            tol = float(self._eval(node.tolerance, env))
        try:
            return abs(float(left) - float(right)) <= tol
        except (TypeError, ValueError):
            return left == right

    def _eval_arrow_pipe(self, node: ArrowPipe, env: Environment) -> Any:
        val = self._eval(node.left, env)
        fn = self._eval(node.right, env)
        if isinstance(fn, (IGLFunction, IGLBuiltin)) or callable(fn):
            # Call the right side with the left value as argument
            fake_call = Call(
                callee=node.right, args=[node.left], kwargs=[],
                line=node.line, col=node.col
            )
            # Evaluate directly
            if isinstance(fn, IGLBuiltin):
                return fn.fn(val)
            if isinstance(fn, IGLFunction):
                return self._call_function(fn, [val], {}, node)
            return fn(val)
        raise IGLRuntimeError(
            "Right side of '->' must be callable",
            node.line, node.col, self._filename
        )

    # ── Utilities ─────────────────────────────────────────────────────────────

    @staticmethod
    def _is_truthy(val: Any) -> bool:
        if isinstance(val, IGLTrustedValue):
            return bool(val.value) and val.score > 0.0
        if val is None:
            return False
        return bool(val)
