"""
IGL runtime values and environment.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


# ── Sentinel signals ──────────────────────────────────────────────────────────

class _ReturnSignal(Exception):
    def __init__(self, value: Any):
        self.value = value


class _BreakSignal(Exception):
    pass


class _ContinueSignal(Exception):
    pass


class IGLRuntimeError(Exception):
    """Runtime error raised during IGL program execution."""
    def __init__(self, message: str, line: int = 0, col: int = 0,
                 filename: str = "<igl>"):
        super().__init__(f"{filename}:{line}:{col}: {message}")
        self.line = line
        self.col = col
        self.filename = filename


class IGLReasonError(IGLRuntimeError):
    """Raised when an assert_reason fails."""


class IGLIdentityError(IGLRuntimeError):
    """Raised when identity verification fails."""


# ── IGL native types ──────────────────────────────────────────────────────────

@dataclass
class IGLFunction:
    """A user-defined IGL function."""
    name: str
    params: List[str]
    defaults: List[Any]
    body: Any          # Block AST node
    closure: "Environment"

    def __repr__(self) -> str:
        return f"<function {self.name}>"


@dataclass
class IGLBuiltin:
    """A built-in function implemented in Python."""
    name: str
    fn: Callable[..., Any]

    def __repr__(self) -> str:
        return f"<builtin {self.name}>"


@dataclass
class IGLIdentity:
    """
    An identity frame – a named context that governs computations.
    Carries typed attributes and a trust score.
    """
    name: str
    attributes: Dict[str, Any] = field(default_factory=dict)
    trust: float = 1.0
    bindings: Dict[str, Any] = field(default_factory=dict)

    def __repr__(self) -> str:
        return f"<identity {self.name} trust={self.trust:.2f}>"

    def verify(self) -> bool:
        """Return True if the identity is consistent and trustworthy."""
        return self.trust > 0.0


@dataclass
class IGLFrame:
    """A bounded context window that scopes identity attributes."""
    name: str
    env: "Environment"

    def __repr__(self) -> str:
        return f"<frame {self.name}>"


@dataclass
class IGLTrustedValue:
    """A value decorated with a confidence score."""
    value: Any
    score: float

    def __repr__(self) -> str:
        return f"<trusted {self.value!r} @ {self.score:.2f}>"


@dataclass
class IGLUDMResult:
    """The result of a UDM (Universal Deterministic Model) block."""
    name: str
    value: Any

    def __repr__(self) -> str:
        return f"<udm:{self.name} {self.value!r}>"


# ── Environment (scope) ───────────────────────────────────────────────────────

class Environment:
    """
    A lexically-scoped variable environment.

    Supports:
    * mutable and immutable bindings
    * identity frame registry
    * drift (tolerance) registry
    * UDM block purity tracking
    """

    def __init__(self, parent: Optional["Environment"] = None, *,
                 udm_mode: bool = False):
        self._parent = parent
        self._vars: Dict[str, Any] = {}
        self._consts: set[str] = set()
        self._identities: Dict[str, IGLIdentity] = {}
        self._drifts: Dict[str, float] = {}
        self._frames: Dict[str, IGLFrame] = {}
        self.udm_mode = udm_mode  # deterministic-only mode

    # ── Variables ─────────────────────────────────────────────────────────────

    def define(self, name: str, value: Any, *, const: bool = False) -> None:
        self._vars[name] = value
        if const:
            self._consts.add(name)

    def assign(self, name: str, value: Any) -> None:
        if name in self._vars:
            if name in self._consts:
                raise IGLRuntimeError(
                    f"Cannot reassign const '{name}'"
                )
            self._vars[name] = value
        elif self._parent is not None:
            self._parent.assign(name, value)
        else:
            raise IGLRuntimeError(f"Undefined variable '{name}'")

    def get(self, name: str) -> Any:
        if name in self._vars:
            return self._vars[name]
        if self._parent is not None:
            return self._parent.get(name)
        raise IGLRuntimeError(f"Undefined variable '{name}'")

    def set_or_define(self, name: str, value: Any) -> None:
        """Define if new, otherwise assign (used in for loops etc.)."""
        try:
            self.assign(name, value)
        except IGLRuntimeError:
            self.define(name, value)

    # ── Identities ────────────────────────────────────────────────────────────

    def register_identity(self, identity: IGLIdentity) -> None:
        self._identities[identity.name] = identity
        # Also expose as a variable for normal access
        self._vars[identity.name] = identity

    def get_identity(self, name: str) -> IGLIdentity:
        if name in self._identities:
            return self._identities[name]
        if self._parent is not None:
            return self._parent.get_identity(name)
        raise IGLRuntimeError(f"Unknown identity '@{name}'")

    # ── Drifts ────────────────────────────────────────────────────────────────

    def set_drift(self, name: str, tolerance: float) -> None:
        self._drifts[name] = tolerance

    def get_drift(self, name: str) -> float:
        if name in self._drifts:
            return self._drifts[name]
        if self._parent is not None:
            return self._parent.get_drift(name)
        return 1e-9  # default epsilon

    # ── Frames ────────────────────────────────────────────────────────────────

    def register_frame(self, frame: IGLFrame) -> None:
        self._frames[frame.name] = frame
        self._vars[frame.name] = frame

    def get_frame(self, name: str) -> IGLFrame:
        if name in self._frames:
            return self._frames[name]
        if self._parent is not None:
            return self._parent.get_frame(name)
        raise IGLRuntimeError(f"Unknown frame '{name}'")

    def child(self, *, udm_mode: bool = False) -> "Environment":
        """Create a child scope."""
        return Environment(parent=self, udm_mode=udm_mode or self.udm_mode)
