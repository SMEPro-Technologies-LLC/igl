"""igl.math – Mathematical functions."""

from __future__ import annotations

import math as _math
import random as _random

from ..interpreter.runtime import IGLBuiltin, IGLTrustedValue
from . import _register


def _make(name: str, fn) -> IGLBuiltin:
    return IGLBuiltin(name=name, fn=fn)


def _unwrap(v):
    return v.value if isinstance(v, IGLTrustedValue) else v


_register("igl.math", {
    "sqrt": _make("sqrt", lambda v: _math.sqrt(_unwrap(v))),
    "log": _make("log", lambda v, base=_math.e: _math.log(_unwrap(v), base)),
    "exp": _make("exp", lambda v: _math.exp(_unwrap(v))),
    "sin": _make("sin", lambda v: _math.sin(_unwrap(v))),
    "cos": _make("cos", lambda v: _math.cos(_unwrap(v))),
    "tan": _make("tan", lambda v: _math.tan(_unwrap(v))),
    "floor": _make("floor", lambda v: _math.floor(_unwrap(v))),
    "ceil": _make("ceil", lambda v: _math.ceil(_unwrap(v))),
    "pi": _math.pi,
    "e": _math.e,
    "inf": _math.inf,
    "nan": _math.nan,
    "isnan": _make("isnan", lambda v: _math.isnan(_unwrap(v))),
    "isinf": _make("isinf", lambda v: _math.isinf(_unwrap(v))),
    "pow": _make("pow", lambda base, exp: _math.pow(_unwrap(base), _unwrap(exp))),
    "random": _make("random", _random.random),
    "randint": _make("randint", _random.randint),
})
