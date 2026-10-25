# Proposal

## Why

The backend's project definition is spread across `requirements.txt`, a `pip freeze` snapshot (`requirements-lock.txt`), `.python-version`, `pytest.ini`, `pyrightconfig.json`, the CI workflow and the Dockerfile. Each states part of the truth independently, so they drift. Two examples: the Python version was 3.13 locally and 3.12 in CI and the image, and CI installs unpinned `requirements.txt` while the image installs the lock. Also, because the lock is a freeze of the dev venv, test tools (pytest, pytest-asyncio, pytest-watch, watchdog, requests) ship in the production image.

## What Changes

- Add `packages/backend/pyproject.toml` as the single backend project definition:
  - runtime dependencies in `[project].dependencies`
  - test and dev tools in a `dev` dependency group
  - `requires-python` set to 3.13
  - pytest and pyright configuration
- Manage the environment with **uv**, using a resolved, hashed, cross-platform `uv.lock`. The same lock is installed in dev, CI and the Docker image.
- **BREAKING (dev workflow):** remove `requirements.txt`, `requirements-lock.txt`, `pytest.ini` and `pyrightconfig.json`. The backend venv moves from `packages/backend/venv` to uv's default `packages/backend/.venv`. Existing checkouts re-run `pnpm install:backend`.
- Root `package.json` backend scripts (`install:backend`, `lock:backend`, `dev:backend`, `test:backend`, `test:backend:watch`) call `uv sync`, `uv lock` and `uv run`. Their names stay the same.
- CI installs uv and runs `uv sync --locked`, so a lock that is out of date with `pyproject.toml` fails the build.
- The backend Dockerfile installs from `uv.lock` with `--no-dev` into a venv that is copied into the runtime stage. This replaces `pip install --user` and the `PYTHONPATH` workaround.
- The Dockerfile copies the backend modules with one glob, `COPY backend/*.py .`, instead of about 25 per-file lines. A new `packages/.dockerignore` at the build context root excludes tests, venvs, local data, and the `frontend/` and `tools/` packages.
- CI smoke-tests the backend image before pushing it, on PRs too. The test starts the container, waits for `/` and `/theatres` to answer, and checks that `pytest` is absent.
- `test_packaging.py` shrinks to a single check: the image's Python version matches the project's. The other checks are retired:
  - The static module-copy guards are replaced by the glob copy plus the smoke test.
  - The requirements-vs-lock check is replaced by `uv sync --locked`.
- No dependency version changes. The first `uv.lock` reproduces the versions pinned in the current `requirements-lock.txt`.

## Capabilities

### New Capabilities

None. This is build and tooling only, and no user-visible behaviour changes, so the change sets `skip_specs: true`.

### Modified Capabilities

None.

## Non-goals

- **No `src/` package layout.** Backend modules stay flat in `packages/backend/` with flat imports. The glob copy gets the single-`COPY` benefit without moving files. A package layout (package imports, a different `../shared` lookup) is a possible follow-up change.
- No wheel or sdist build and no publishing. The backend is deployed only as a container image.
- No dependency upgrades. Upgrades are a separate `uv lock --upgrade` once this lands.
- `packages/tools/scripts` (tile generation, with its own `requirements.txt`) is not migrated.
- No new linters or formatters (for example ruff).
- No change to the frontend or pnpm workspace beyond the backend scripts in the root `package.json`.

## Impact

- **New files:** `packages/backend/pyproject.toml`, `packages/backend/uv.lock`, `packages/.dockerignore`. `packages/backend/.python-version` is kept and stays at 3.13.
- **Removed files:** `requirements.txt`, `requirements-lock.txt`, `pytest.ini`, `pyrightconfig.json`, and `packages/backend/.dockerignore`, which is never read because the build context is `packages/`.
- **Changed:**
  - root `package.json` scripts
  - `.github/workflows/ci.yml` (backend install and test steps; `build-backend` now also runs on PRs, with a smoke step, and pushes only outside PRs)
  - `packages/backend/Dockerfile` (install stage, runtime env, glob copy)
  - `packages/backend/test_packaging.py`
  - `.gitignore`
  - `.vscode/settings.json`
  - `README.md`
- **New tool:** uv, needed on developer machines, in CI (via `astral-sh/setup-uv`) and in the image build (copied from the official uv image, version pinned).
- **Production image:** smaller, because it no longer contains the test tools. Runtime behaviour, ports, volumes and the entry command are unchanged.
- **Out of scope:** no API, data or migration changes, and none of the centralized-flightplans architecture decisions (AD-1…AD-17) are affected.
