"""Packaging guards: the production image must contain what the app needs.

The Dockerfile copies backend files one by one and installs dependencies from
`requirements-lock.txt`, so a new module or a new requirement can be missed and
only fail at container start (a 502 behind Caddy). These tests catch that in CI.
"""
import ast
import os
import re

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DOCKERFILE = os.path.join(BACKEND_DIR, "Dockerfile")
REQUIREMENTS = os.path.join(BACKEND_DIR, "requirements.txt")
LOCK = os.path.join(BACKEND_DIR, "requirements-lock.txt")


def _read(path: str) -> str:
    with open(path) as f:
        return f.read()


def copied_backend_paths(dockerfile: str) -> set[str]:
    """Paths (relative to the backend dir) copied by `COPY backend/<path> …` lines."""
    paths = set()
    for line in dockerfile.splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[0] == "COPY" and parts[1].startswith("backend/"):
            paths.add(parts[1][len("backend/"):].rstrip("/"))
    return paths


def local_modules_imported_from(entry: str, backend_dir: str = BACKEND_DIR) -> set[str]:
    """Local module files (`name.py`) reachable from `entry` through imports,
    including imports inside functions."""
    seen: set[str] = set()
    pending = [entry]
    while pending:
        filename = pending.pop()
        if filename in seen:
            continue
        seen.add(filename)
        tree = ast.parse(_read(os.path.join(backend_dir, filename)), filename=filename)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                names = [node.module]
            else:
                continue
            for name in names:
                candidate = name.split(".")[0] + ".py"
                if os.path.isfile(os.path.join(backend_dir, candidate)):
                    pending.append(candidate)
    return seen


def _canonical(name: str) -> str:
    """PEP 503 normalized project name."""
    return re.sub(r"[-_.]+", "-", name).lower()


def requirement_names(text: str) -> set[str]:
    """Project names from a requirements file (ignoring comments, options, extras, pins)."""
    names = set()
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        match = re.match(r"[A-Za-z0-9][A-Za-z0-9._-]*", line)
        if match:
            names.add(_canonical(match.group(0)))
    return names


# --- Tests -----------------------------------------------------------------

def test_every_module_the_app_imports_is_copied_into_the_image():
    copied = copied_backend_paths(_read(DOCKERFILE))
    needed = local_modules_imported_from("main.py")
    missing = sorted(needed - copied)
    assert not missing, (
        f"Dockerfile does not COPY {missing}; the container would fail with "
        f"ModuleNotFoundError. Add `COPY backend/<file> .` lines."
    )


def test_every_copied_backend_path_exists():
    copied = copied_backend_paths(_read(DOCKERFILE))
    missing = sorted(p for p in copied if not os.path.exists(os.path.join(BACKEND_DIR, p)))
    assert not missing, f"Dockerfile copies paths that do not exist: {missing}"


def test_migrations_are_copied_into_the_image():
    assert "migrations" in copied_backend_paths(_read(DOCKERFILE))


def test_every_requirement_is_pinned_in_the_lock_file():
    required = requirement_names(_read(REQUIREMENTS))
    locked = requirement_names(_read(LOCK))
    missing = sorted(required - locked)
    assert not missing, (
        f"requirements-lock.txt is missing {missing}; the image installs from the "
        f"lock file. Regenerate it with `pnpm lock:backend`."
    )


# --- The guards themselves ---------------------------------------------------

def test_guard_detects_a_module_missing_from_the_dockerfile():
    dockerfile = "COPY backend/main.py .\nCOPY backend/db.py .\n"
    needed = local_modules_imported_from("main.py")
    assert needed - copied_backend_paths(dockerfile)  # e.g. sync.py, space_routes.py


def test_guard_follows_imports_inside_functions():
    # kneeboard.py imports overview_map_page lazily, inside a function.
    assert "overview_map_page.py" in local_modules_imported_from("main.py")


def test_requirement_names_are_normalized():
    names = requirement_names("uvicorn[standard]\npycrdt-websocket>=0.16  # sync\n-r other.txt\nPillow==12.0\n")
    assert names == {"uvicorn", "pycrdt-websocket", "pillow"}
