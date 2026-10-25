"""Packaging guard: the production image runs the Python the project declares.

The Dockerfile's `FROM python:X.Y-…` tag cannot read `.python-version` or
`requires-python` in `pyproject.toml`, so the two can drift apart (the image was
once on 3.12 while development and the lock were on 3.13). This test catches
that in CI.

What the image contains is checked by running it: CI starts the built container
and smoke-tests it before pushing (see `.github/workflows/ci.yml`).
"""
import os
import re
import tomllib

from packaging.specifiers import SpecifierSet

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DOCKERFILE = os.path.join(BACKEND_DIR, "Dockerfile")
PYTHON_VERSION_FILE = os.path.join(BACKEND_DIR, ".python-version")
PYPROJECT = os.path.join(BACKEND_DIR, "pyproject.toml")


def _read(path: str) -> str:
    with open(path) as f:
        return f.read()


def python_base_image_versions(dockerfile: str) -> list[str]:
    """`X.Y` of every `FROM python:X.Y…` line, in order."""
    return re.findall(r"^FROM\s+python:(\d+\.\d+)\S*", dockerfile, re.MULTILINE | re.IGNORECASE)


def _minor(version: str) -> str:
    """`3.13.2` -> `3.13`."""
    return ".".join(version.strip().split(".")[:2])


# --- Tests -----------------------------------------------------------------

def test_image_python_matches_python_version_file():
    expected = _minor(_read(PYTHON_VERSION_FILE))
    versions = python_base_image_versions(_read(DOCKERFILE))
    assert versions, "Dockerfile has no `FROM python:X.Y…` line"
    wrong = [v for v in versions if v != expected]
    assert not wrong, (
        f"Dockerfile builds on Python {wrong} but .python-version says {expected}; "
        f"update the `FROM python:` tags."
    )


def test_image_python_satisfies_requires_python():
    requires = tomllib.loads(_read(PYPROJECT))["project"]["requires-python"]
    versions = python_base_image_versions(_read(DOCKERFILE))
    wrong = [v for v in versions if not SpecifierSet(requires).contains(v)]
    assert not wrong, (
        f"Dockerfile builds on Python {wrong}, outside requires-python {requires!r}."
    )


# --- The guard itself --------------------------------------------------------

def test_base_image_versions_are_parsed():
    dockerfile = (
        "FROM python:3.13-slim-bookworm AS builder\n"
        "COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /bin/uv\n"
        "from python:3.12\n"
    )
    assert python_base_image_versions(dockerfile) == ["3.13", "3.12"]
