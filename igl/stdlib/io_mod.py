"""igl.io – Input/output utilities."""

from __future__ import annotations

import json as _json

from ..interpreter.runtime import IGLBuiltin, IGLRuntimeError
from . import _register


def _make(name: str, fn) -> IGLBuiltin:
    return IGLBuiltin(name=name, fn=fn)


def _read_file(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except OSError as e:
        raise IGLRuntimeError(str(e))


def _write_file(path: str, content: str) -> None:
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
    except OSError as e:
        raise IGLRuntimeError(str(e))


def _parse_json(text: str):
    try:
        return _json.loads(text)
    except _json.JSONDecodeError as e:
        raise IGLRuntimeError(f"JSON parse error: {e}")


def _to_json(value, indent: int = None) -> str:
    try:
        return _json.dumps(value, indent=indent, default=str)
    except (TypeError, ValueError) as e:
        raise IGLRuntimeError(f"JSON serialization error: {e}")


_register("igl.io", {
    "read_file": _make("read_file", _read_file),
    "write_file": _make("write_file", _write_file),
    "parse_json": _make("parse_json", _parse_json),
    "to_json": _make("to_json", _to_json),
})
