"""
Tests for IGL static checker and related runtime enforcement.

Covers:
* UDM loop-close obligation discharge (static)
* UDM effect checks – print/emit forbidden inside udm (static)
* Anchored-only escape / restricted unwrap (runtime)
"""

import pytest
import igl
from igl.checker import StaticChecker, StaticCheckError, check_ast
from igl.interpreter import IGLRuntimeError
from igl.lexer import Lexer
from igl.parser import Parser


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse(source: str):
    tokens = Lexer(source, "<test>").tokenize()
    return Parser(tokens, "<test>").parse()


def errors_for(source: str):
    """Return StaticCheckError list for *source* without running it."""
    return check_ast(_parse(source), "<test>")


def run(source: str):
    return igl.run(source, "<test>")


# ── UDM loop-close obligation ─────────────────────────────────────────────────

class TestUDMLoopCloseObligation:
    def test_udm_with_resolve_is_ok(self):
        assert errors_for("""
udm good {
    resolve 42
}
""") == []

    def test_udm_with_loop_close_is_ok(self):
        assert errors_for("""
udm good {
    let x = 10
    loop_close x
}
""") == []

    def test_udm_without_close_raises(self):
        errs = errors_for("""
udm bad {
    let x = 1 + 1
}
""")
        assert len(errs) == 1
        assert "never resolves or closes the loop" in str(errs[0])

    def test_run_udm_without_close_raises(self):
        with pytest.raises(StaticCheckError, match="never resolves or closes the loop"):
            run("""
udm bad {
    let x = 1 + 1
}
""")

    def test_nested_udm_each_checked_independently(self):
        # outer closes, inner does not → one error
        errs = errors_for("""
udm outer {
    udm inner {
        let x = 1
    }
    resolve 0
}
""")
        assert len(errs) == 1
        assert "inner" in str(errs[0])

    def test_resolve_inside_if_counts(self):
        # resolve inside an if branch still satisfies the obligation
        assert errors_for("""
udm conditional {
    if true {
        resolve 1
    }
    resolve 0
}
""") == []

    def test_loop_close_deep_counts(self):
        assert errors_for("""
udm deep {
    let x = 5
    loop_close x * 2
}
""") == []


# ── UDM effect checks ─────────────────────────────────────────────────────────

class TestUDMEffectChecks:
    def test_print_in_udm_raises(self):
        errs = errors_for("""
udm side_effect {
    print("oops")
    resolve 1
}
""")
        assert len(errs) == 1
        assert "print()" in str(errs[0])
        assert "side-effecting" in str(errs[0])

    def test_run_print_in_udm_raises(self):
        with pytest.raises(StaticCheckError, match="side-effecting"):
            run("""
udm side_effect {
    print("oops")
    resolve 1
}
""")

    def test_emit_in_udm_raises(self):
        errs = errors_for("""
udm emitter {
    emit 42
    resolve 1
}
""")
        assert len(errs) == 1
        assert "emit" in str(errs[0])

    def test_print_outside_udm_is_ok(self):
        assert errors_for('print("hi")') == []

    def test_print_in_reason_is_ok(self):
        # reason blocks are not pure-deterministic, print is allowed
        assert errors_for("""
reason check {
    print("debug")
    resolve 1
}
""") == []

    def test_multiple_errors_reported(self):
        # Both no-close and side-effect errors are reported
        errs = errors_for("""
udm bad {
    print("oops")
}
""")
        # one error for side-effect (print), one for no close
        assert len(errs) == 2


# ── Anchored-only escape / restricted unwrap ──────────────────────────────────

class TestRestrictedUnwrap:
    def test_unwrap_trusted_value_ok(self):
        result = run("unwrap(#! 0.9 42)")
        assert result == 42

    def test_unwrap_udm_result_ok(self):
        src = """
udm comp {
    resolve 99
}
unwrap(comp)
"""
        assert run(src) == 99

    def test_unwrap_plain_int_raises(self):
        with pytest.raises(IGLRuntimeError, match="trust-annotated"):
            run("unwrap(42)")

    def test_unwrap_plain_string_raises(self):
        with pytest.raises(IGLRuntimeError, match="trust-annotated"):
            run('unwrap("hello")')

    def test_unwrap_plain_bool_raises(self):
        with pytest.raises(IGLRuntimeError, match="trust-annotated"):
            run("unwrap(true)")

    def test_unwrap_list_raises(self):
        with pytest.raises(IGLRuntimeError, match="trust-annotated"):
            run("unwrap([1, 2, 3])")

    def test_unwrap_null_raises(self):
        with pytest.raises(IGLRuntimeError, match="trust-annotated"):
            run("unwrap(null)")

    def test_unwrap_in_reason_block_ok(self):
        # unwrap inside reason block on a trusted value is fine
        src = """
let v = #! 0.8 55
reason get {
    resolve unwrap(v)
}
get
"""
        assert run(src) == 55

    def test_unwrap_udm_result_in_udm_ok(self):
        # unwrap a udm_result from inside another udm block is allowed
        src = """
udm inner {
    resolve 7
}
udm outer {
    let x = unwrap(inner)
    resolve x * 2
}
outer
"""
        from igl.interpreter import IGLUDMResult
        result = run(src)
        assert isinstance(result, IGLUDMResult)
        assert result.value == 14


# ── Integration: clean closed-loop program passes all checks ──────────────────

class TestStaticCheckerIntegration:
    def test_full_closed_loop_no_errors(self):
        """The reference closed-loop example must be error-free."""
        src = """
identity sensor { source: "AI_model" }
trust sensor = 0.9

let raw = #! 0.9 0.75

reason validate {
    assert_reason trust_score(raw) > 0.5 : "Low trust"
    assert_reason unwrap(raw) > 0.0      : "Positive"
    resolve raw
}

udm normalise {
    let v = unwrap(validate)
    resolve round(v * 100.0, 2)
}

anchor normalise in @sensor
normalise
"""
        assert errors_for(src) == []

    def test_check_api_returns_empty_for_valid(self):
        errors = igl.check("udm ok { resolve 1 }", "<test>")
        assert errors == []

    def test_check_api_returns_errors_for_invalid(self):
        errors = igl.check("udm bad { let x = 1 }", "<test>")
        assert len(errors) == 1
        assert isinstance(errors[0], StaticCheckError)
