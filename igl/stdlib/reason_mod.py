"""
igl.reason – Reasoning and logic utilities.
"""

from __future__ import annotations

import math
from typing import Any

from ..interpreter.runtime import IGLTrustedValue, IGLBuiltin, IGLRuntimeError
from . import _register


def _make(name: str, fn) -> IGLBuiltin:
    return IGLBuiltin(name=name, fn=fn)


def _weighted_trust(*values: Any) -> float:
    """
    Compute the combined trust score of a sequence of values.
    Uses the geometric mean of individual trust scores.
    """
    scores = []
    for v in values:
        if isinstance(v, IGLTrustedValue):
            scores.append(v.score)
        else:
            scores.append(1.0)
    if not scores:
        return 1.0
    product = 1.0
    for s in scores:
        product *= max(0.0, s)
    return product ** (1.0 / len(scores))


def _chain_trust(*values: Any) -> IGLTrustedValue:
    """
    Chain-propagate trust through a sequence of trusted values.
    The result trust = product of individual scores (like probability chain).
    """
    combined_score = 1.0
    last_val: Any = None
    for v in values:
        if isinstance(v, IGLTrustedValue):
            combined_score *= v.score
            last_val = v.value
        else:
            last_val = v
    return IGLTrustedValue(value=last_val, score=combined_score)


def _is_consistent(a: Any, b: Any, tolerance: float = 1e-9) -> bool:
    """
    Check whether two values are logically consistent.
    For numerics: within tolerance.  For others: equality.
    """
    av = a.value if isinstance(a, IGLTrustedValue) else a
    bv = b.value if isinstance(b, IGLTrustedValue) else b
    try:
        return abs(float(av) - float(bv)) <= tolerance
    except (TypeError, ValueError):
        return av == bv


def _contradiction(a: Any, b: Any) -> bool:
    """Return True if a and b are logically contradictory."""
    return not _is_consistent(a, b)


def _entails(premise: Any, conclusion: Any) -> bool:
    """
    Simplified entailment check.
    Returns True if the premise (trusted value with score > 0.5) supports conclusion.
    """
    if isinstance(premise, IGLTrustedValue):
        return premise.score > 0.5 and bool(premise.value)
    return bool(premise)


def _reason_score(v: Any) -> float:
    """Score the 'reasonableness' of a value [0..1]."""
    if isinstance(v, IGLTrustedValue):
        return v.score
    if v is None:
        return 0.0
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        if math.isnan(v) or math.isinf(v):
            return 0.0
        return 1.0
    return 1.0


_register("igl.reason", {
    "weighted_trust": _make("weighted_trust", _weighted_trust),
    "chain_trust": _make("chain_trust", _chain_trust),
    "is_consistent": _make("is_consistent", _is_consistent),
    "contradiction": _make("contradiction", _contradiction),
    "entails": _make("entails", _entails),
    "reason_score": _make("reason_score", _reason_score),
})
