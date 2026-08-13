"""igl.collections – Collection utilities."""

from __future__ import annotations

from typing import Any

from ..interpreter.runtime import IGLBuiltin, IGLRuntimeError, IGLTrustedValue
from . import _register


def _make(name: str, fn) -> IGLBuiltin:
    return IGLBuiltin(name=name, fn=fn)


def _map_fn(fn, lst: list) -> list:
    if isinstance(lst, IGLTrustedValue):
        lst = lst.value
    from ..interpreter.runtime import IGLFunction, IGLBuiltin
    results = []
    for item in lst:
        if isinstance(fn, IGLBuiltin):
            results.append(fn.fn(item))
        elif callable(fn):
            results.append(fn(item))
        else:
            raise IGLRuntimeError("map requires a callable")
    return results


def _filter_fn(fn, lst: list) -> list:
    if isinstance(lst, IGLTrustedValue):
        lst = lst.value
    from ..interpreter.runtime import IGLBuiltin
    results = []
    for item in lst:
        if isinstance(fn, IGLBuiltin):
            keep = fn.fn(item)
        elif callable(fn):
            keep = fn(item)
        else:
            raise IGLRuntimeError("filter requires a callable")
        if keep:
            results.append(item)
    return results


def _reduce_fn(fn, lst: list, initial: Any = None) -> Any:
    if isinstance(lst, IGLTrustedValue):
        lst = lst.value
    from ..interpreter.runtime import IGLBuiltin
    if not lst:
        return initial
    acc = initial if initial is not None else lst[0]
    start = 0 if initial is not None else 1
    for item in lst[start:]:
        if isinstance(fn, IGLBuiltin):
            acc = fn.fn(acc, item)
        elif callable(fn):
            acc = fn(acc, item)
        else:
            raise IGLRuntimeError("reduce requires a callable")
    return acc


def _zip_lists(*lists) -> list:
    return [list(t) for t in zip(*lists)]


def _flatten(lst: list, depth: int = 1) -> list:
    if isinstance(lst, IGLTrustedValue):
        lst = lst.value
    result = []
    for item in lst:
        if isinstance(item, list) and depth > 0:
            result.extend(_flatten(item, depth - 1))
        else:
            result.append(item)
    return result


def _unique(lst: list) -> list:
    if isinstance(lst, IGLTrustedValue):
        lst = lst.value
    seen = []
    for item in lst:
        if item not in seen:
            seen.append(item)
    return seen


def _sort_list(lst: list, reverse: bool = False) -> list:
    if isinstance(lst, IGLTrustedValue):
        lst = lst.value
    return sorted(lst, reverse=reverse)


_register("igl.collections", {
    "map": _make("map", _map_fn),
    "filter": _make("filter", _filter_fn),
    "reduce": _make("reduce", _reduce_fn),
    "zip": _make("zip", _zip_lists),
    "flatten": _make("flatten", _flatten),
    "unique": _make("unique", _unique),
    "sort": _make("sort", _sort_list),
})
