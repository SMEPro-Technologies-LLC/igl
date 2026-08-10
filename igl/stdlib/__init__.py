"""
IGL Standard Library loader.

Modules available:
  igl.core       – built-in functions always in scope
  igl.identity   – identity management helpers
  igl.reason     – reasoning and logic utilities
  igl.udm        – Universal Deterministic Model helpers
  igl.math       – mathematical functions
  igl.io         – input/output utilities
  igl.collections – collection utilities
"""

from __future__ import annotations

from typing import Any, Optional

from ..interpreter.runtime import Environment, IGLBuiltin


# ── Module registry ───────────────────────────────────────────────────────────

_MODULES: dict[str, dict] = {}


def _register(name: str, module: dict) -> None:
    _MODULES[name] = module


def get_module(name: str) -> Optional[dict]:
    """Return a module dict by dotted name, or None if not found."""
    return _MODULES.get(name)


def load_stdlib(env: Environment) -> None:
    """Inject all built-in names into the given environment."""
    from . import core, identity_mod, reason_mod, udm_mod, math_mod, io_mod, collections_mod  # noqa: F401
    for name, fn in _MODULES.get("igl.core", {}).items():
        env.define(name, fn)
