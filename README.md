# IGL – Identity-Governed Language

> **The first language built for intelligence instead of software.**

IGL exists because AI numerical reasoning and UDM (Universal Deterministic Model) deterministic computation create a new **closed-loop condition** that existing languages cannot express.

Traditional languages were designed for software: deterministic machines executing human instructions step by step.  IGL is designed for **intelligence**: closed-loop systems where an AI numerical signal feeds into a deterministic computation whose output is governed by a named, trusted identity frame—and must resolve back into that same frame.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Installation](#installation)
3. [Core Concepts](#core-concepts)
4. [Language Reference](#language-reference)
5. [Examples](#examples)
6. [Standard Library](#standard-library)
7. [Architecture](#architecture)
8. [Contributing](#contributing)

---

## Quick Start

```igl
# hello.igl
identity agent { role: "AI", model: "transformer_v3" }
trust agent = 0.95
verify @agent

reason greet {
    assert_reason agent.trust > 0.5 : "Agent must be trustworthy"
    resolve "Hello, Identity-Governed World!"
}

print(greet)
```

```bash
$ igl run hello.igl
Hello, Identity-Governed World!
```

---

## Installation

**Requirements:** Python 3.10+

```bash
pip install igl-lang
```

Or install from source:

```bash
git clone https://github.com/SMEPro-Technologies-LLC/igl.git
cd igl
pip install -e .
```

### CLI

```
igl run <file.igl>     – execute an IGL program
igl repl               – interactive REPL
igl check <file.igl>   – parse-check without executing
igl version            – print version
```

---

## Core Concepts

### The Closed-Loop Condition

Existing languages have no way to express the following:

> An AI model produces a numerical output with a confidence score.  
> That output is validated by deterministic rules.  
> The validated result is bound to a named identity frame.  
> Future computations are governed by — and anchored to — that identity.  
> The loop closes: the computation's result is the identity's output.

IGL makes this a first-class language construct.

```
┌─────────────────────────────────────────────────────────┐
│  AI numerical output  (trust-annotated signal)          │
│         │                                               │
│         ▼                                               │
│  reason { assert_reason ... ; resolve }   ← validation  │
│         │                                               │
│         ▼                                               │
│  udm { ... ; resolve }   ← deterministic computation   │
│         │                                               │
│         ▼                                               │
│  anchor result in @identity   ← close the loop         │
│         │                                               │
│         ▼                                               │
│  loop_close result            ← convergence declared   │
└─────────────────────────────────────────────────────────┘
```

### Identity Frames

An **identity** is a named, typed context that governs downstream computation.  It carries attributes and a trust score.

```igl
identity sensor {
    source: "AI_model"
    unit:   "probability"
}
trust sensor = 0.92
verify @sensor
```

### Reason Blocks

A **reason** block is an explicit reasoning region.  It must `resolve` a value.  `assert_reason` checks logical claims within the block.

```igl
reason validate {
    assert_reason signal > 0.0 : "Signal must be positive"
    assert_reason signal < 1.0 : "Signal must be bounded"
    resolve signal
}
```

### UDM Blocks

A **udm** (Universal Deterministic Model) block guarantees referential transparency.  The computation inside is pure and deterministic.

```igl
udm normalise {
    let v = unwrap(validated_signal)
    resolve round(v * 100.0, 2)
}
```

Every `udm` block **must** contain a `resolve` or `loop_close` statement – the static checker enforces this before execution.  Side-effecting calls such as `print()` or `emit` are forbidden inside `udm` blocks.

### Staged Value Model

IGL values pass through three stages that form the trust boundary:

| Stage | Type | How it is created |
|---|---|---|
| **Unvalidated** | raw primitive | literals, arithmetic |
| **Trust-annotated** | `trusted<T>` | `#! <score> <expr>` |
| **Validated/computed** | `udm_result` | result of a `udm` block |

The `unwrap()` built-in is the **only** sanctioned way to exit the trust domain back to a raw value.  Calling `unwrap()` on an unvalidated primitive is a runtime error – the value was never annotated or computed through the pipeline.

### Closed-Loop Static Checks

IGL runs a static checker after parsing and before execution.  Any violation halts the program:

| Rule | What is checked |
|---|---|
| **UDM loop-close obligation** | every `udm` block must contain `resolve` or `loop_close` |
| **UDM effect check** | `print()` and `emit` are forbidden inside `udm` blocks |
| **Anchored-only escape** *(runtime)* | `unwrap()` only accepts `trusted<T>` or `udm_result` values |

See [`docs/static_semantics.md`](docs/static_semantics.md) for the full specification.

### Trust Annotations

Any value can carry a **trust score** using the `#!` annotation:

```igl
let signal = #! 0.88 0.7432   # value 0.7432 with 88% confidence
print(trust_score(signal))    # 0.88
print(unwrap(signal))         # 0.7432
```

### Drift Equality (`~=`)

`~=` tests whether two values are equal within a tolerance (the *drift*):

```igl
drift epsilon = 1e-6
1.0000001 ~= 1.0000002   # true within 1e-6 tolerance
```

---

## Language Reference

### Keywords

| Keyword | Purpose |
|---|---|
| `identity` | Declare an identity frame |
| `reason` | Open a reasoning block |
| `assert_reason` | Assert a logical claim (raises if false) |
| `resolve` | Return a value from a `reason` or `udm` block |
| `loop_close` | Declare computational convergence |
| `udm` | Universal Deterministic Model block |
| `drift` | Define an allowable uncertainty range |
| `anchor` | Pin a value to an identity frame |
| `trust` | Set the confidence score of an identity |
| `verify` | Check that an identity is consistent and trusted |
| `frame` | A bounded context window |
| `bind` | Associate a value with an identity |
| `unbind` | Release an identity binding |
| `propagate` | Forward identity attributes to another identity |
| `emit` | Output a value from a reasoning context |

### Standard Operators

| Operator | Meaning |
|---|---|
| `->` | Arrow pipe: `x -> f` calls `f(x)` |
| `=>` | Bind mapping |
| `~=` | Drift equality (approximate equality) |
| `@name` | Identity reference |
| `#! score expr` | Trust annotation |
| `frame::member` | Frame scope resolution |

### Control Flow

```igl
if condition { ... } elif condition { ... } else { ... }
while condition { ... }
for item in iterable { ... }
break
continue
return value
```

### Functions

```igl
def name(param1, param2 = default) {
    return value
}
```

---

## Examples

### Hello, World

```igl
print("Hello, Identity-Governed World!")
```

### Identity & Trust

```igl
identity agent { role: "primary_reasoner", model: "transformer_v3" }
trust agent = 0.92
verify @agent : "agent must be trustworthy"

print(agent.role)    # primary_reasoner
print(agent.trust)   # 0.92
```

### Closed-Loop Computation

```igl
identity sensor { source: "AI_model", unit: "probability" }
trust sensor = 0.88

let raw_signal = #! 0.88 0.7432

reason validate_signal {
    assert_reason trust_score(raw_signal) > 0.5 : "Signal trust too low"
    assert_reason unwrap(raw_signal) > 0.0      : "Signal must be positive"
    assert_reason unwrap(raw_signal) < 1.0      : "Signal must be bounded"
    resolve raw_signal
}

udm normalise {
    let v = unwrap(validate_signal)
    resolve round(v * 100.0, 2)
}

anchor normalise in @sensor
print(normalise)     # udm:normalise(74.32)
loop_close normalise
```

### Arrow Pipes

```igl
def double(x) { return x * 2 }
def inc(x)    { return x + 1 }

let result = 5 -> double -> inc   # 11
```

### Frames

```igl
frame ctx {
    let threshold = 0.75
    let label = "high_confidence"
}

print(ctx::threshold)   # 0.75
print(ctx.label)        # high_confidence
```

---

## Standard Library

| Module | Functions |
|---|---|
| `igl.core` | `print`, `input`, `int`, `float`, `str`, `bool`, `type`, `len`, `range`, `list`, `keys`, `values`, `items`, `append`, `contains`, `abs`, `max`, `min`, `sum`, `round`, `trust_score`, `unwrap`, `assert`, `repr` |
| `igl.identity` | `identity_trust`, `identity_attrs`, `identity_name`, `set_trust`, `is_identity`, `merge_identity` |
| `igl.reason` | `weighted_trust`, `chain_trust`, `is_consistent`, `contradiction`, `entails`, `reason_score` |
| `igl.udm` | `udm_value`, `udm_name`, `is_udm_result`, `deterministic_hash`, `udm_assert_equal` |
| `igl.math` | `sqrt`, `log`, `exp`, `sin`, `cos`, `tan`, `floor`, `ceil`, `pi`, `e`, `pow`, `random`, `randint` |
| `igl.io` | `read_file`, `write_file`, `parse_json`, `to_json` |
| `igl.collections` | `map`, `filter`, `reduce`, `zip`, `flatten`, `unique`, `sort` |

---

## Architecture

```
igl/
├── igl/
│   ├── __init__.py          # Public API: run(), run_file()
│   ├── __main__.py          # python -m igl entry point
│   ├── lexer/
│   │   ├── tokens.py        # Token types & keyword table
│   │   └── lexer.py         # Lexer (tokeniser)
│   ├── parser/
│   │   ├── ast_nodes.py     # AST node dataclasses
│   │   └── parser.py        # Recursive-descent parser
│   ├── interpreter/
│   │   ├── runtime.py       # Environment, IGL value types
│   │   └── interpreter.py   # Tree-walk interpreter
│   ├── stdlib/
│   │   ├── __init__.py      # Module registry & stdlib loader
│   │   ├── core.py          # igl.core built-ins
│   │   ├── identity_mod.py  # igl.identity
│   │   ├── reason_mod.py    # igl.reason
│   │   ├── udm_mod.py       # igl.udm
│   │   ├── math_mod.py      # igl.math
│   │   ├── io_mod.py        # igl.io
│   │   └── collections_mod.py  # igl.collections
│   └── cli/
│       └── __init__.py      # CLI: run / repl / check / version
├── tests/
│   ├── test_lexer.py
│   ├── test_parser.py
│   └── test_interpreter.py
├── examples/
│   ├── hello.igl
│   ├── identity_demo.igl
│   ├── reason_demo.igl
│   ├── udm_demo.igl
│   └── closed_loop.igl
├── docs/
│   └── spec.md
└── pyproject.toml
```

---

## Contributing

IGL is an open research project.  Contributions, issues, and discussion are welcome.

```bash
# Run tests
python -m pytest tests/ -v

# Run a specific example
python -m igl run examples/closed_loop.igl

# Start the REPL
python -m igl repl
```

---

## License

MIT © SMEPro Technologies LLC

