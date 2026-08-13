"""
igl.identity – Identity management helpers.
"""

from __future__ import annotations

from typing import Any

from ..interpreter.runtime import IGLIdentity, IGLTrustedValue, IGLRuntimeError, IGLBuiltin
from . import _register


def _make(name: str, fn) -> IGLBuiltin:
    return IGLBuiltin(name=name, fn=fn)


def _identity_trust(id_obj: IGLIdentity) -> float:
    """Return the trust score of an identity."""
    if not isinstance(id_obj, IGLIdentity):
        raise IGLRuntimeError(f"Expected identity, got {type(id_obj).__name__}")
    return id_obj.trust


def _identity_attrs(id_obj: IGLIdentity) -> dict:
    """Return the attribute dict of an identity."""
    if not isinstance(id_obj, IGLIdentity):
        raise IGLRuntimeError(f"Expected identity, got {type(id_obj).__name__}")
    return dict(id_obj.attributes)


def _identity_name(id_obj: IGLIdentity) -> str:
    if not isinstance(id_obj, IGLIdentity):
        raise IGLRuntimeError(f"Expected identity, got {type(id_obj).__name__}")
    return id_obj.name


def _set_trust(id_obj: IGLIdentity, score: float) -> IGLIdentity:
    if not isinstance(id_obj, IGLIdentity):
        raise IGLRuntimeError(f"Expected identity, got {type(id_obj).__name__}")
    id_obj.trust = float(score)
    return id_obj


def _is_identity(v: Any) -> bool:
    return isinstance(v, IGLIdentity)


def _merge_identity(a: IGLIdentity, b: IGLIdentity) -> IGLIdentity:
    """Create a new identity merging attributes of a and b (b wins on conflict)."""
    if not isinstance(a, IGLIdentity) or not isinstance(b, IGLIdentity):
        raise IGLRuntimeError("merge_identity requires two identity objects")
    merged = IGLIdentity(
        name=f"{a.name}+{b.name}",
        attributes={**a.attributes, **b.attributes},
        trust=min(a.trust, b.trust),
    )
    return merged


_register("igl.identity", {
    "identity_trust": _make("identity_trust", _identity_trust),
    "identity_attrs": _make("identity_attrs", _identity_attrs),
    "identity_name": _make("identity_name", _identity_name),
    "set_trust": _make("set_trust", _set_trust),
    "is_identity": _make("is_identity", _is_identity),
    "merge_identity": _make("merge_identity", _merge_identity),
})
