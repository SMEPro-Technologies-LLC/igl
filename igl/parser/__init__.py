"""IGL Parser package."""
from .parser import Parser, ParseError
from .ast_nodes import *  # noqa: F401, F403

__all__ = ["Parser", "ParseError"]
