"""Tests for the IGL interpreter."""

import pytest
import igl
from igl.interpreter import (
    IGLRuntimeError, IGLReasonError, IGLIdentityError,
    IGLIdentity, IGLTrustedValue, IGLUDMResult,
)


def run(source: str):
    return igl.run(source, "<test>")


class TestBasicEvaluation:
    def test_integer_literal(self):
        assert run("42") == 42

    def test_float_literal(self):
        assert abs(run("3.14") - 3.14) < 1e-9

    def test_string_literal(self):
        assert run('"hello"') == "hello"

    def test_bool_true(self):
        assert run("true") is True

    def test_bool_false(self):
        assert run("false") is False

    def test_null(self):
        assert run("null") is None

    def test_arithmetic(self):
        assert run("2 + 3 * 4") == 14
        assert run("(2 + 3) * 4") == 20
        assert run("10 / 4") == 2.5
        assert run("10 % 3") == 1
        assert run("2 ** 8") == 256

    def test_comparison(self):
        assert run("1 == 1") is True
        assert run("1 != 2") is True
        assert run("3 < 5") is True
        assert run("5 >= 5") is True

    def test_logical(self):
        assert run("true and false") is False
        assert run("true or false") is True
        assert run("not false") is True

    def test_unary_minus(self):
        assert run("-7") == -7

    def test_list(self):
        assert run("[1, 2, 3]") == [1, 2, 3]

    def test_dict(self):
        assert run('{"a": 1}') == {"a": 1}


class TestVariables:
    def test_let(self):
        assert run("let x = 10\nx") == 10

    def test_const(self):
        assert run("const PI = 3.14\nPI") == pytest.approx(3.14)

    def test_const_reassign_raises(self):
        with pytest.raises(IGLRuntimeError):
            run("const X = 1\nX = 2")

    def test_assignment_update(self):
        assert run("let x = 5\nx += 3\nx") == 8

    def test_undefined_raises(self):
        with pytest.raises(IGLRuntimeError):
            run("undefined_var")


class TestControlFlow:
    def test_if_true(self):
        assert run("if true { 42 } else { 0 }") == 42

    def test_if_false(self):
        assert run("if false { 42 } else { 99 }") == 99

    def test_elif(self):
        src = """
let x = 2
if x == 1 { "one" } elif x == 2 { "two" } else { "other" }
"""
        assert run(src) == "two"

    def test_while(self):
        src = """
let i = 0
let s = 0
while i < 5 {
    s += i
    i += 1
}
s
"""
        assert run(src) == 10

    def test_for(self):
        src = """
let s = 0
for n in [1, 2, 3, 4, 5] {
    s += n
}
s
"""
        assert run(src) == 15

    def test_break(self):
        src = """
let i = 0
while true {
    if i >= 3 { break }
    i += 1
}
i
"""
        assert run(src) == 3

    def test_continue(self):
        src = """
let s = 0
for n in [1, 2, 3, 4, 5] {
    if n == 3 { continue }
    s += n
}
s
"""
        assert run(src) == 12


class TestFunctions:
    def test_simple_function(self):
        src = """
def add(a, b) { return a + b }
add(3, 4)
"""
        assert run(src) == 7

    def test_recursion(self):
        src = """
def fact(n) {
    if n <= 1 { return 1 }
    return n * fact(n - 1)
}
fact(6)
"""
        assert run(src) == 720

    def test_closure(self):
        src = """
def make_adder(x) {
    def adder(y) { return x + y }
    return adder
}
let add5 = make_adder(5)
add5(3)
"""
        assert run(src) == 8

    def test_default_params(self):
        src = """
def greet(name, prefix = "Hello") {
    return prefix + ", " + name
}
greet("World")
"""
        assert run(src) == "Hello, World"


class TestIdentity:
    def test_identity_decl(self):
        src = '''
identity agent { role: "AI" }
agent.role
'''
        assert run(src) == "AI"

    def test_identity_ref(self):
        src = '''
identity agent { role: "AI" }
@agent.role
'''
        assert run(src) == "AI"

    def test_trust_statement(self):
        src = '''
identity agent { role: "AI" }
trust agent = 0.75
agent.trust
'''
        assert run(src) == pytest.approx(0.75)

    def test_verify_passes(self):
        src = '''
identity agent { role: "AI" }
trust agent = 0.9
verify @agent
'''
        assert run(src) is True

    def test_verify_fails_zero_trust(self):
        with pytest.raises(IGLIdentityError):
            run('''
identity bad { }
trust bad = 0.0
verify @bad
''')

    def test_anchor(self):
        src = '''
identity agent { role: "AI" }
let v = 42
anchor v in @agent
agent.bindings
'''
        result = run(src)
        assert result["__anchor__"] == 42

    def test_bind_unbind(self):
        src = '''
identity agent { }
let value = 99
bind value => @agent
agent.bindings
'''
        result = run(src)
        assert result["value"] == 99

    def test_propagate(self):
        src = '''
identity src { score: 0.9 }
identity tgt { }
trust src = 0.8
propagate @src -> @tgt
tgt.score
'''
        assert run(src) == pytest.approx(0.9)


class TestReasonBlocks:
    def test_resolve(self):
        src = """
reason compute {
    let x = 21 * 2
    resolve x
}
compute
"""
        assert run(src) == 42

    def test_assert_reason_passes(self):
        src = """
reason check {
    assert_reason 5 > 0 : "positive"
    resolve true
}
check
"""
        assert run(src) is True

    def test_assert_reason_fails(self):
        with pytest.raises(IGLReasonError):
            run("""
reason check {
    assert_reason 0 > 5 : "impossible"
    resolve true
}
""")

    def test_reason_label_optional(self):
        src = """
reason {
    resolve 123
}
"""
        assert run(src) == 123


class TestUDM:
    def test_udm_basic(self):
        src = """
udm compute {
    resolve 2 + 2
}
compute
"""
        result = run(src)
        assert isinstance(result, IGLUDMResult)
        assert result.value == 4
        assert result.name == "compute"

    def test_udm_loop_close(self):
        src = """
udm algo {
    let x = 10
    loop_close x * 2
}
algo
"""
        result = run(src)
        assert isinstance(result, IGLUDMResult)
        assert result.value == 20


class TestTrustAnnotations:
    def test_trust_annotation(self):
        result = run("#! 0.85 42")
        assert isinstance(result, IGLTrustedValue)
        assert result.value == 42
        assert result.score == pytest.approx(0.85)

    def test_trust_score_builtin(self):
        result = run("trust_score(#! 0.7 99)")
        assert result == pytest.approx(0.7)

    def test_unwrap_builtin(self):
        assert run("unwrap(#! 0.5 100)") == 100

    def test_drift_equality_within(self):
        # Identical values should be within drift
        assert run("1.0 ~= 1.0") is True

    def test_drift_equality_close(self):
        # Values within floating-point epsilon should be equal
        assert run("0.1 + 0.2 ~= 0.30000000000000004") is True

    def test_drift_equality_outside(self):
        assert run("0.0 ~= 1.0") is False


class TestArrowPipe:
    def test_arrow_pipe(self):
        src = """
def double(x) { return x * 2 }
5 -> double
"""
        assert run(src) == 10

    def test_chained_arrow(self):
        src = """
def inc(x) { return x + 1 }
def double(x) { return x * 2 }
3 -> double -> inc
"""
        assert run(src) == 7


class TestFrames:
    def test_frame_scope(self):
        src = """
frame ctx {
    let value = 42
}
ctx.value
"""
        assert run(src) == 42

    def test_frame_scope_resolution(self):
        src = """
frame ctx {
    let value = 99
}
ctx::value
"""
        assert run(src) == 99


class TestBuiltins:
    def test_print(self, capsys):
        run('print("hi")')
        captured = capsys.readouterr()
        assert "hi" in captured.out

    def test_len(self):
        assert run("len([1, 2, 3])") == 3
        assert run('len("hello")') == 5

    def test_range(self):
        assert run("range(5)") == [0, 1, 2, 3, 4]

    def test_type(self):
        assert run("type(42)") == "int"
        assert run("type(3.14)") == "float"
        assert run('type("x")') == "string"
        assert run("type(true)") == "bool"
        assert run("type(null)") == "null"

    def test_abs(self):
        assert run("abs(-5)") == 5

    def test_max_min(self):
        assert run("max([1, 3, 2])") == 3
        assert run("min([1, 3, 2])") == 1

    def test_sum(self):
        assert run("sum([1, 2, 3, 4])") == 10

    def test_round(self):
        assert run("round(3.7)") == 4

    def test_keys(self):
        assert sorted(run('keys({"a": 1, "b": 2})')) == ["a", "b"]

    def test_contains(self):
        assert run("contains([1, 2, 3], 2)") is True
        assert run("contains([1, 2, 3], 9)") is False


class TestClosedLoop:
    """Integration test for the key IGL closed-loop concept."""

    def test_full_closed_loop(self):
        src = """
identity sensor {
    source: "AI_model"
    unit: "probability"
}
trust sensor = 0.9

let raw = #! 0.9 0.75

reason validate {
    assert_reason trust_score(raw) > 0.5 : "Low trust"
    assert_reason unwrap(raw) > 0.0      : "Positive"
    assert_reason unwrap(raw) < 1.0      : "Bounded"
    resolve raw
}

udm normalise {
    let v = unwrap(validate)
    resolve round(v * 100.0, 2)
}

anchor normalise in @sensor
normalise
"""
        result = run(src)
        assert isinstance(result, IGLUDMResult)
        assert result.value == pytest.approx(75.0)
