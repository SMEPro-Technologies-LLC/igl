# IGL Language Specification

**Version:** 0.1.0  
**Status:** Draft

---

## 1. Introduction

IGL (Identity-Governed Language) is the first language designed for **intelligence** rather than software. It provides first-class primitives for:

- Identity frames that govern computation context
- Reason blocks that must explicitly resolve
- Universal Deterministic Model (UDM) blocks for pure computation
- Trust annotations on values
- Drift equality for approximate numerical reasoning
- Arrow piping for composable computation
- Closed-loop declarations for convergence

---

## 2. Lexical Structure

### 2.1 Source Encoding

IGL source files are UTF-8 encoded text files, conventionally using the `.igl` extension.

### 2.2 Comments

Line comments begin with `#` and extend to the end of the line.  The `#!` sequence is reserved as a trust annotation prefix and is **not** a comment.

```
# This is a comment
#! 0.9 value  # This is a trust annotation
```

### 2.3 Whitespace

Spaces and tabs are ignored.  Newlines terminate statements: a `NEWLINE` token is emitted at the end of every non-empty logical line.  A semicolon (`;`) may be used as an explicit statement terminator.

### 2.4 Literals

| Kind | Examples |
|---|---|
| Integer | `0`, `42`, `1_000_000` |
| Float | `3.14`, `1e5`, `2.7E-3` |
| String | `"hello"`, `'world'`, `"line\nnext"` |
| Boolean | `true`, `false` |
| Null | `null` |

### 2.5 Identifiers and Keywords

An identifier begins with a letter or underscore, followed by letters, digits, or underscores.  Keywords are reserved.

**Standard keywords:**  
`if else elif while for in return break continue def let const import from as and or not true false null`

**IGL-native keywords:**  
`identity reason assert_reason loop_close udm drift anchor resolve emit trust verify frame bind unbind propagate`

---

## 3. Types

| Type | Description |
|---|---|
| `int` | Arbitrary-precision integer |
| `float` | IEEE 754 double-precision float |
| `string` | UTF-8 string |
| `bool` | `true` or `false` |
| `null` | Absence of value |
| `list` | Ordered mutable sequence |
| `dict` | Key-value mapping |
| `function` | User-defined function |
| `identity` | Named identity frame with trust score |
| `trusted<T>` | Value `T` decorated with a confidence score |
| `udm_result` | Result of a UDM computation |
| `frame` | Bounded context window |

---

## 4. Expressions

### 4.1 Operator Precedence (low → high)

| Level | Operators |
|---|---|
| Assignment | `= += -= *= /= %=` |
| Logical OR | `or` `\|\|` |
| Logical AND | `and` `&&` |
| Logical NOT | `not` `!` |
| Comparison | `== != < > <= >= ~=` |
| Arrow pipe | `->` |
| Additive | `+ -` |
| Multiplicative | `* / // % **` |
| Unary | `-` `~` `not` |
| Call / member | `f()` `.attr` `[idx]` |
| Primary | literals, identifiers, `@ref`, `#!`, `(expr)` |

### 4.2 Arithmetic

Standard: `+  -  *  /  %  **`  
Integer floor-division: `//`  
Bitwise: `&  |  ^  ~  <<  >>`

### 4.3 Identity Reference (`@name`)

Produces the identity object registered under `name`.

```igl
@sensor.trust   # trust score of identity 'sensor'
```

### 4.4 Trust Annotation (`#! score expr`)

Wraps `expr` in a `trusted<T>` value with the given confidence score (0.0–1.0).

```igl
let v = #! 0.85 42.0
trust_score(v)   # 0.85
unwrap(v)        # 42.0
```

### 4.5 Drift Equality (`~=`)

Tests approximate numerical equality. Returns `true` if `|left - right| ≤ ε`. A bare `~=` uses the active ambient drift from the nearest enclosing `drift` declaration, falling back to `1e-9` if none is active. An explicit per-expression tolerance may be supplied with `within`, which takes precedence over the ambient drift.

```igl
0.1 + 0.2 ~= 0.30000000000000004   # true
3.14159 ~= 3.14200 within 0.01     # true
```

### 4.6 Arrow Pipe (`->`)

Pipes the left-hand value as the first argument to the right-hand function.

```igl
5 -> double -> inc   # inc(double(5)) = 11
```

### 4.7 Frame Scope Resolution (`::`)

Accesses a member of a named frame.

```igl
frame::member
```

---

## 5. Statements

### 5.1 Variable Binding

```igl
let name = expr    # mutable binding
const name = expr  # immutable binding (reassignment raises an error)
```

### 5.2 Assignment

```igl
name = expr
name += expr   # also -=  *=  /=  %=
```

### 5.3 Functions

```igl
def name(param1, param2 = default) {
    ...
    return value
}
```

### 5.4 Control Flow

```igl
if condition { ... }
elif condition { ... }
else { ... }

while condition { ... }

for variable in iterable { ... }

break
continue
return [value]
```

---

## 6. IGL-Native Constructs

### 6.1 Identity Declaration

```igl
identity name {
    attr1: value1
    attr2: value2
}
```

Declares a named identity frame with attributes and a default trust of 1.0.

### 6.2 Trust Statement

```igl
trust name = score
```

Sets the trust score (0.0–1.0) of an identity or wraps a value in a `trusted<T>`.

### 6.3 Verify Statement

```igl
verify @name
verify @name : "message"
```

Raises `IGLIdentityError` if the identity's trust score is ≤ 0.0.

### 6.4 Anchor Statement

```igl
anchor value in @identity
```

Stores `value` in the identity's bindings dict under key `__anchor__`.

### 6.5 Bind / Unbind

```igl
bind variable => @identity
unbind variable
```

Associates a named value with an identity frame.

### 6.6 Propagate

```igl
propagate @source -> @target
```

Copies all attributes from `source` to `target` and sets `target.trust = min(source.trust, target.trust)`.

### 6.7 Reason Block

```igl
reason [label] {
    ...
    resolve value
}
```

An explicit reasoning region.  The block must contain a `resolve` statement.  If `label` is provided, the resolved value is stored under that name in the enclosing scope.  `loop_close` may also resolve the block.

### 6.8 Assert Reason

```igl
assert_reason condition
assert_reason condition : "message"
```

Raises `IGLReasonError` if `condition` is falsy.

### 6.9 Resolve Statement

```igl
resolve value
```

Returns `value` from the enclosing `reason` or `udm` block.

### 6.10 UDM Block

```igl
udm name {
    ...
    resolve value
}
```

Executes the body in deterministic mode.  The result is stored under `name` as an `IGLUDMResult`.

### 6.11 Loop Close

```igl
loop_close value
```

Declares computational convergence.  Inside a `reason` or `udm` block, it acts as `resolve`.  At the top level, it declares the final result of the program.

### 6.12 Drift Statement

```igl
drift name = tolerance
```

Registers a named drift (tolerance) value in the current scope.

The most recently declared `drift` in the current lexical scope becomes that scope's active ambient drift. Bare drift equality expressions (`left ~= right`) use the nearest active ambient drift from the enclosing scope chain. To override it for a single comparison, use:

```igl
left ~= right within tolerance
```

### 6.13 Frame Declaration

```igl
frame name {
    ...
}
```

Creates a bounded context window.  Members defined in the frame body are accessible via `name.member` or `name::member`.

### 6.14 Emit

```igl
emit value
```

Outputs a value from a reasoning context.  Semantically equivalent to evaluating `value`; used for clarity in reasoning blocks.

---

## 7. Standard Library

### 7.1 igl.core (always in scope)

| Function | Signature | Description |
|---|---|---|
| `print` | `print(*args)` | Print values |
| `input` | `input(prompt?)` | Read user input |
| `int` | `int(v)` | Convert to integer |
| `float` | `float(v)` | Convert to float |
| `str` | `str(v)` | Convert to string |
| `bool` | `bool(v)` | Convert to boolean |
| `type` | `type(v)` | Return type name string |
| `len` | `len(v)` | Length of collection |
| `range` | `range(stop)` / `range(start, stop, step?)` | Integer range |
| `list` | `list(v)` | Convert to list |
| `keys` | `keys(d)` | Dict/identity keys |
| `values` | `values(d)` | Dict/identity values |
| `items` | `items(d)` | Dict key-value pairs |
| `append` | `append(lst, item)` | Append to list |
| `contains` | `contains(c, item)` | Membership test |
| `abs` | `abs(v)` | Absolute value |
| `max` | `max(*args)` | Maximum |
| `min` | `min(*args)` | Minimum |
| `sum` | `sum(lst)` | Sum |
| `round` | `round(v, digits?)` | Round |
| `trust_score` | `trust_score(v)` | Confidence score of a trusted value |
| `unwrap` | `unwrap(v)` | Extract value from trusted wrapper |
| `assert` | `assert(cond, msg?)` | Runtime assertion |
| `repr` | `repr(v)` | IGL representation string |

### 7.2 igl.identity

`identity_trust`, `identity_attrs`, `identity_name`, `set_trust`, `is_identity`, `merge_identity`

### 7.3 igl.reason

`weighted_trust`, `chain_trust`, `is_consistent`, `contradiction`, `entails`, `reason_score`

### 7.4 igl.udm

`udm_value`, `udm_name`, `is_udm_result`, `deterministic_hash`, `udm_assert_equal`

### 7.5 igl.math

`sqrt`, `log`, `exp`, `sin`, `cos`, `tan`, `floor`, `ceil`, `pi`, `e`, `inf`, `nan`, `isnan`, `isinf`, `pow`, `random`, `randint`

### 7.6 igl.io

`read_file`, `write_file`, `parse_json`, `to_json`

### 7.7 igl.collections

`map`, `filter`, `reduce`, `zip`, `flatten`, `unique`, `sort`

---

## 8. Error Types

| Error | Raised when |
|---|---|
| `LexError` | Unexpected character or unterminated literal |
| `ParseError` | Unexpected token or malformed syntax |
| `IGLRuntimeError` | General runtime error (undefined names, type errors, etc.) |
| `IGLReasonError` | `assert_reason` condition is false |
| `IGLIdentityError` | `verify` fails (trust ≤ 0) |

---

## 9. Grammar (EBNF)

```ebnf
program      ::= { statement NEWLINE } EOF

statement    ::= identity_decl | reason_block | assert_reason | loop_close
               | udm_block | drift_stmt | anchor_stmt | resolve_stmt
               | trust_stmt | verify_stmt | frame_decl | bind_stmt
               | unbind_stmt | propagate_stmt | emit_stmt
               | let_stmt | function_def | if_stmt | while_stmt
               | for_stmt | return_stmt | "break" | "continue"
               | import_stmt | from_import_stmt | expr_stmt

identity_decl ::= "identity" IDENT "{" { IDENT ":" expr terminator } "}"
reason_block  ::= "reason" [ IDENT ] block
assert_reason ::= "assert_reason" expr [ ":" expr ]
loop_close    ::= "loop_close" expr
udm_block     ::= "udm" IDENT block
drift_stmt    ::= "drift" IDENT "=" expr
anchor_stmt   ::= "anchor" expr "in" "@" IDENT
resolve_stmt  ::= "resolve" expr
trust_stmt    ::= "trust" IDENT "=" expr
verify_stmt   ::= "verify" "@" IDENT [ ":" expr ]
frame_decl    ::= "frame" IDENT block
bind_stmt     ::= "bind" IDENT "=>" "@" IDENT
unbind_stmt   ::= "unbind" IDENT
propagate_stmt::= "propagate" "@" IDENT "->" "@" IDENT
emit_stmt     ::= "emit" expr

let_stmt      ::= ("let" | "const") IDENT "=" expr
function_def  ::= "def" IDENT "(" param_list ")" block
if_stmt       ::= "if" expr block { "elif" expr block } [ "else" block ]
while_stmt    ::= "while" expr block
for_stmt      ::= "for" IDENT "in" expr block
return_stmt   ::= "return" [ expr ]

block         ::= "{" { statement terminator } "}"
param_list    ::= [ IDENT [ "=" expr ] { "," IDENT [ "=" expr ] } ]
terminator    ::= NEWLINE | ";"

expr          ::= assignment
assignment    ::= or_expr [ assign_op assignment ]
or_expr       ::= and_expr { "or" and_expr }
and_expr      ::= not_expr { "and" not_expr }
not_expr      ::= "not" not_expr | comparison
comparison    ::= arrow_pipe { cmp_op arrow_pipe [ "within" arrow_pipe ] }
arrow_pipe    ::= addition { "->" addition }
addition      ::= multiplication { ("+" | "-") multiplication }
multiplication::= unary { ("*" | "/" | "//" | "%" | "**") unary }
unary         ::= ("-" | "~") unary | call
call          ::= primary { "(" arg_list ")" | "." IDENT | "[" expr "]" }
primary       ::= INT | FLOAT | STRING | "true" | "false" | "null"
               | IDENT [ "::" IDENT ]
               | "@" IDENT
               | "#!" FLOAT primary
               | "emit" expr
               | "[" { expr "," } "]"
               | "{" { expr ":" expr "," } "}"
               | "(" expr ")"

cmp_op        ::= "==" | "!=" | "<" | ">" | "<=" | ">=" | "~="
assign_op     ::= "=" | "+=" | "-=" | "*=" | "/=" | "%="
```

---

## 10. Versioning

IGL follows [Semantic Versioning](https://semver.org/).  The current version is **0.1.0** (initial release).  Breaking changes to the language syntax or semantics will be documented and will increment the major version.
