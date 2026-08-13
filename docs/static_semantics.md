# IGL Static Semantics

**Version:** 0.1.0  
**Status:** Draft

---

## 1. Overview

IGL enforces *closed-loop guarantees by construction*: the type system and
static checker together prevent programs from silently violating the
identity-governed computation model before a single instruction is executed.

This document describes the three static-semantic rules that are checked
immediately after parsing (before interpretation) and the one companion
runtime rule that protects the trust boundary at call time.

---

## 2. Staged Value Model

Every value in IGL belongs to one of three stages:

| Stage | Type | How it is created |
|---|---|---|
| **Unvalidated** | raw Python / IGL primitive | literals, arithmetic, variable reads |
| **Trust-annotated** | `trusted<T>` (`IGLTrustedValue`) | `#! <score> <expr>` |
| **Validated/computed** | `udm_result` (`IGLUDMResult`) | result of a `udm` block |

The central closed-loop invariant is:

> *Unvalidated values may not escape the trust boundary.*

The `unwrap()` built-in is the controlled exit point from the trust/validated
domain back to raw values.  The rules below ensure this exit is never taken
inadvertently.

---

## 3. Static Check Rules

The following rules are enforced by `igl.checker.StaticChecker` on the AST
*before* any interpretation takes place.  A violation raises
`igl.checker.StaticCheckError` and halts execution.

### Rule 1 – UDM Loop-Close Obligation

**Trigger:** a `udm <name> { … }` block whose body contains no `resolve` or
`loop_close` statement.

**Rationale:** A `udm` block declares a *closed-loop computation*.  If the
block never explicitly resolves, the loop is left open — which is a
contradiction.  Every `udm` block must close the loop by construction.

**Example (violation):**

```igl
# ERROR: udm 'bad' never resolves or closes the loop
udm bad {
    let x = 1 + 1
}
```

**Example (correct):**

```igl
udm good {
    let x = 1 + 1
    resolve x     # or: loop_close x
}
```

`resolve` and `loop_close` are semantically equivalent; `loop_close` is the
idiomatic choice when emphasising convergence.

Nested `udm` blocks are each checked independently — a `resolve` in an outer
block does not satisfy the obligation of an inner block.

### Rule 2 – UDM Effect Check

**Trigger:** a call to `print()` or an `emit` expression appearing inside a
`udm` block.

**Rationale:** `udm` blocks are intended to be *pure and deterministic*.
Side-effecting operations (`print`, `emit`) make a block's result dependent on
the execution environment and break referential transparency.

**Example (violation):**

```igl
# ERROR: 'print()' is a side-effecting operation and is not allowed inside a udm block
udm noisy {
    print("debug")
    resolve 42
}
```

**Example (correct):**

```igl
udm quiet {
    resolve 42
}
print("result: " + str(quiet))   # side effects outside the udm are fine
```

`print` is allowed anywhere *outside* `udm` blocks, including in `reason`
blocks and top-level code.

---

## 4. Runtime Rule – Anchored-Only Escape (Restricted `unwrap`)

**Trigger:** `unwrap(v)` called with `v` that is neither an `IGLTrustedValue`
(created via `#! <score> <expr>`) nor an `IGLUDMResult` (produced by a `udm`
block).

**Rationale:** `unwrap()` strips trust metadata and returns the raw inner
value.  Calling it on an unvalidated value means the value was never passed
through the trust/validation pipeline — it has effectively *leaked* out of the
closed loop without being anchored.

**Example (violation):**

```igl
# RuntimeError: unwrap() requires a trust-annotated value
let x = 42
unwrap(x)
```

**Example (correct):**

```igl
let trusted = #! 0.9 42
unwrap(trusted)    # → 42

udm compute {
    resolve 99
}
unwrap(compute)    # → 99  (IGLUDMResult)
```

This check is enforced at runtime (rather than statically) because the type of
an expression's value cannot always be determined at parse time.

---

## 5. Interaction with the Interpreter

The `igl.run()` and `igl.check()` functions both run the static checker
automatically:

```python
import igl

# Static check + execute
result = igl.run(source)

# Static check only (returns list of StaticCheckError)
errors = igl.check(source)
```

The CLI `igl check <file.igl>` command now runs both the parser *and* the
static checker, reporting all violations as errors.

---

## 6. Summary Table

| Rule | Where enforced | Error type |
|---|---|---|
| UDM loop-close obligation | Static (pre-execution) | `StaticCheckError` |
| UDM effect check (`print`/`emit`) | Static (pre-execution) | `StaticCheckError` |
| Anchored-only escape (`unwrap`) | Runtime | `IGLRuntimeError` |
