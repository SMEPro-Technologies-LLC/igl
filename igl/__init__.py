"""
IGL - Identity-Governed Language
The first language built for intelligence instead of software.

IGL exists because AI numerical reasoning and UDM (Universal Deterministic
Model) computation create a new closed-loop condition that existing languages
cannot express.
"""

__version__ = "0.1.0"
__author__ = "SMEPro Technologies LLC"
__license__ = "MIT"

from .lexer.lexer import Lexer
from .parser.parser import Parser
from .interpreter.interpreter import Interpreter
from .checker import StaticChecker, StaticCheckError, check_ast


def run(source: str, filename: str = "<igl>") -> object:
    """Parse, static-check, and evaluate an IGL program, returning the final value."""
    lexer = Lexer(source, filename)
    tokens = lexer.tokenize()
    parser = Parser(tokens, filename)
    ast = parser.parse()
    errors = check_ast(ast, filename)
    if errors:
        raise errors[0]
    interpreter = Interpreter(filename)
    return interpreter.evaluate(ast)


def check(source: str, filename: str = "<igl>") -> list:
    """Parse and static-check an IGL program without executing it.

    Returns a list of :class:`StaticCheckError` instances (empty = OK).
    """
    lexer = Lexer(source, filename)
    tokens = lexer.tokenize()
    parser = Parser(tokens, filename)
    ast = parser.parse()
    return check_ast(ast, filename)


def run_file(path: str) -> object:
    """Load and run an IGL source file."""
    with open(path, "r", encoding="utf-8") as f:
        source = f.read()
    return run(source, filename=path)


__all__ = ["Lexer", "Parser", "Interpreter", "StaticChecker", "StaticCheckError",
           "check_ast", "run", "check", "run_file", "__version__"]
