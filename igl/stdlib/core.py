"""
igl.core – built-in functions always in scope.
"""

from __future__ import annotations

import math as _math
import sys
from typing import Any

from ..interpreter.runtime import (
    IGLBuiltin, IGLIdentity, IGLTrustedValue, IGLUDMResult,
    IGLRuntimeError,
)
from . import _register


def _make(name: str, fn) -> IGLBuiltin:
    return IGLBuiltin(name=name, fn=fn)


# ── I/O ───────────────────────────────────────────────────────────────────────

def _print(*args) -> None:
    print(*[_igl_repr(a) for a in args])


def _input(prompt: str = "") -> str:
    return input(prompt)


# ── Type conversion ───────────────────────────────────────────────────────────

def _int(v) -> int:
    if isinstance(v, IGLTrustedValue):
        v = v.value
    return int(v)


def _float(v) -> float:
    if isinstance(v, IGLTrustedValue):
        v = v.value
    return float(v)


def _str(v) -> str:
    return _igl_repr(v)


def _bool(v) -> bool:
    if isinstance(v, IGLTrustedValue):
        return bool(v.value) and v.score > 0.0
    return bool(v)


def _type(v) -> str:
    if isinstance(v, IGLIdentity):
        return "identity"
    if isinstance(v, IGLTrustedValue):
        return f"trusted<{_type(v.value)}>"
    if isinstance(v, IGLUDMResult):
        return "udm_result"
    if isinstance(v, dict):
        return "dict"
    if isinstance(v, list):
        return "list"
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, int):
        return "int"
    if isinstance(v, float):
        return "float"
    if isinstance(v, str):
        return "string"
    if v is None:
        return "null"
    return type(v).__name__


# ── Collections ───────────────────────────────────────────────────────────────

def _len(v) -> int:
    if isinstance(v, IGLTrustedValue):
        v = v.value
    return len(v)


def _range(*args) -> list:
    return list(range(*args))


def _list(v) -> list:
    if isinstance(v, IGLTrustedValue):
        v = v.value
    return list(v)


def _keys(v) -> list:
    if isinstance(v, dict):
        return list(v.keys())
    if isinstance(v, IGLIdentity):
        return list(v.attributes.keys())
    raise IGLRuntimeError(f"keys() expects a dict or identity, got {type(v).__name__}")


def _values(v) -> list:
    if isinstance(v, dict):
        return list(v.values())
    if isinstance(v, IGLIdentity):
        return list(v.attributes.values())
    raise IGLRuntimeError(f"values() expects a dict or identity, got {type(v).__name__}")


def _items(v) -> list:
    if isinstance(v, dict):
        return [[k, val] for k, val in v.items()]
    raise IGLRuntimeError(f"items() expects a dict, got {type(v).__name__}")


def _append(lst, item) -> list:
    lst.append(item)
    return lst


def _contains(collection, item) -> bool:
    if isinstance(collection, IGLTrustedValue):
        collection = collection.value
    return item in collection


# ── Math ──────────────────────────────────────────────────────────────────────

def _abs(v) -> Any:
    if isinstance(v, IGLTrustedValue):
        v = v.value
    return abs(v)


def _max(*args) -> Any:
    flat = []
    for a in args:
        if isinstance(a, list):
            flat.extend(a)
        else:
            flat.append(a)
    return max(flat)


def _min(*args) -> Any:
    flat = []
    for a in args:
        if isinstance(a, list):
            flat.extend(a)
        else:
            flat.append(a)
    return min(flat)


def _sum(lst) -> Any:
    if isinstance(lst, IGLTrustedValue):
        lst = lst.value
    return sum(lst)


def _round(v, digits=0) -> Any:
    if isinstance(v, IGLTrustedValue):
        v = v.value
    return round(v, digits)


# ── Reasoning utilities ───────────────────────────────────────────────────────

def _trust_score(v) -> float:
    """Return the trust score of a value (1.0 if not annotated)."""
    if isinstance(v, IGLTrustedValue):
        return v.score
    if isinstance(v, IGLIdentity):
        return v.identity.trust if hasattr(v, "identity") else 1.0
    return 1.0


def _unwrap(v) -> Any:
    """Unwrap a trusted value, returning its inner value."""
    if isinstance(v, IGLTrustedValue):
        return v.value
    return v


def _assert(condition, message="Assertion failed") -> bool:
    if not condition:
        raise IGLRuntimeError(str(message))
    return True


# ── Formatting ────────────────────────────────────────────────────────────────

def _igl_repr(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, IGLIdentity):
        return repr(v)
    if isinstance(v, IGLTrustedValue):
        return f"{_igl_repr(v.value)} #! {v.score:.4f}"
    if isinstance(v, IGLUDMResult):
        return f"udm:{v.name}({_igl_repr(v.value)})"
    if isinstance(v, list):
        return "[" + ", ".join(_igl_repr(x) for x in v) + "]"
    if isinstance(v, dict):
        pairs = ", ".join(f"{_igl_repr(k)}: {_igl_repr(val)}" for k, val in v.items())
        return "{" + pairs + "}"
    return str(v)


# ── Register module ───────────────────────────────────────────────────────────

_register("igl.core", {
    "print": _make("print", _print),
    "input": _make("input", _input),
    "int": _make("int", _int),
    "float": _make("float", _float),
    "str": _make("str", _str),
    "bool": _make("bool", _bool),
    "type": _make("type", _type),
    "len": _make("len", _len),
    "range": _make("range", _range),
    "list": _make("list", _list),
    "keys": _make("keys", _keys),
    "values": _make("values", _values),
    "items": _make("items", _items),
    "append": _make("append", _append),
    "contains": _make("contains", _contains),
    "abs": _make("abs", _abs),
    "max": _make("max", _max),
    "min": _make("min", _min),
    "sum": _make("sum", _sum),
    "round": _make("round", _round),
    "trust_score": _make("trust_score", _trust_score),
    "unwrap": _make("unwrap", _unwrap),
    "assert": _make("assert", _assert),
    "repr": _make("repr", _igl_repr),
})
