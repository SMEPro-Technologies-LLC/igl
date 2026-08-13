"""
igl.udm – Universal Deterministic Model helpers.
"""

from __future__ import annotations

from typing import Any, Callable

from ..interpreter.runtime import IGLUDMResult, IGLBuiltin, IGLRuntimeError
from . import _register


def _make(name: str, fn) -> IGLBuiltin:
    return IGLBuiltin(name=name, fn=fn)


def _udm_value(result: IGLUDMResult) -> Any:
    """Extract the value from a UDM result."""
    if not isinstance(result, IGLUDMResult):
        raise IGLRuntimeError(f"Expected UDM result, got {type(result).__name__}")
    return result.value


def _udm_name(result: IGLUDMResult) -> str:
    """Return the name of a UDM block result."""
    if not isinstance(result, IGLUDMResult):
        raise IGLRuntimeError(f"Expected UDM result, got {type(result).__name__}")
    return result.name


def _is_udm_result(v: Any) -> bool:
    return isinstance(v, IGLUDMResult)


def _deterministic_hash(v: Any) -> int:
    """
    Compute a deterministic hash for a value (for use in UDM verification).
    """
    try:
        return hash(v)
    except TypeError:
        return hash(str(v))


def _udm_assert_equal(a: IGLUDMResult, b: IGLUDMResult) -> bool:
    """Assert that two UDM results are equal (same name + value)."""
    if not isinstance(a, IGLUDMResult) or not isinstance(b, IGLUDMResult):
        raise IGLRuntimeError("udm_assert_equal requires two UDM results")
    if a.value != b.value:
        raise IGLRuntimeError(
            f"UDM determinism violation: '{a.name}' produced different results "
            f"({a.value!r} vs {b.value!r})"
        )
    return True


_register("igl.udm", {
    "udm_value": _make("udm_value", _udm_value),
    "udm_name": _make("udm_name", _udm_name),
    "is_udm_result": _make("is_udm_result", _is_udm_result),
    "deterministic_hash": _make("deterministic_hash", _deterministic_hash),
    "udm_assert_equal": _make("udm_assert_equal", _udm_assert_equal),
})
