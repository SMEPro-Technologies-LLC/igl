"""
IGL Command-Line Interface.

Usage:
    igl run <file.igl>          – run an IGL program
    igl repl                    – start the interactive REPL
    igl check <file.igl>        – parse and type-check without executing
    igl version                 – print version
"""

from __future__ import annotations

import sys
import os


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        _print_usage()
        return

    cmd = args[0]

    if cmd == "version":
        from igl import __version__
        print(f"IGL {__version__}")
        return

    if cmd == "run":
        if len(args) < 2:
            _die("Usage: igl run <file.igl>")
        _run_file(args[1])
        return

    if cmd == "repl":
        _run_repl()
        return

    if cmd == "check":
        if len(args) < 2:
            _die("Usage: igl check <file.igl>")
        _check_file(args[1])
        return

    _die(f"Unknown command: {cmd!r}. Run 'igl --help' for usage.")


# ── Commands ──────────────────────────────────────────────────────────────────

def _run_file(path: str) -> None:
    if not os.path.exists(path):
        _die(f"File not found: {path}")
    try:
        import igl
        igl.run_file(path)
    except Exception as e:
        _die(str(e))


def _check_file(path: str) -> None:
    if not os.path.exists(path):
        _die(f"File not found: {path}")
    try:
        with open(path, "r", encoding="utf-8") as f:
            source = f.read()
        from igl.lexer import Lexer
        from igl.parser import Parser
        tokens = Lexer(source, path).tokenize()
        Parser(tokens, path).parse()
        print(f"OK: {path}")
    except Exception as e:
        _die(str(e))


def _run_repl() -> None:
    from igl import __version__
    from igl.lexer import Lexer, LexError
    from igl.parser import Parser, ParseError
    from igl.interpreter import Interpreter, IGLRuntimeError
    from igl.stdlib.core import _igl_repr

    print(f"IGL {__version__} interactive REPL  (Ctrl-D or 'exit' to quit)")
    interp = Interpreter("<repl>")
    env = interp._global_env

    while True:
        try:
            line = input("igl> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not line:
            continue
        if line in ("exit", "quit"):
            break

        # Support multi-line input with trailing backslash
        while line.endswith("\\"):
            line = line[:-1]
            try:
                continuation = input("...  ")
            except (EOFError, KeyboardInterrupt):
                break
            line += "\n" + continuation

        try:
            tokens = Lexer(line, "<repl>").tokenize()
            ast = Parser(tokens, "<repl>").parse()
            result = interp.evaluate(ast, env)
            if result is not None:
                print(_igl_repr(result))
        except (LexError, ParseError, IGLRuntimeError) as e:
            print(f"Error: {e}", file=sys.stderr)
        except Exception as e:
            print(f"Internal error: {e}", file=sys.stderr)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _print_usage() -> None:
    print(
        "IGL – Identity-Governed Language\n"
        "\n"
        "Usage:\n"
        "  igl run <file.igl>     Run an IGL program\n"
        "  igl repl               Start the interactive REPL\n"
        "  igl check <file.igl>   Parse-check without executing\n"
        "  igl version            Print version\n"
        "  igl --help             Show this help\n"
    )


def _die(message: str) -> None:
    print(f"igl: {message}", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
