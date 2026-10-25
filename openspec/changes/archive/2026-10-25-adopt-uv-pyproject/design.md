# Design

## Context

See proposal.md (Why) for the motivation. This section covers the current state that shapes the approach.

- **Flat modules.** The backend is about 22 top-level modules (`main.py`, `plans.py`, `sync.py`, …) plus `test_*.py` files beside them. It is not an installable package. Imports are flat (`import plans`), and `map_annotations.py` finds `pictogramCatalog.json` through the relative path `../shared`.
- **How dependencies are installed today:**
  - Dev: `pnpm install:backend` creates `packages/backend/venv` and runs `pip install -r requirements.txt`.
  - Lock: `pnpm lock:backend` writes `pip freeze` output to `requirements-lock.txt`.
  - CI: installs `requirements.txt`, not the lock.
  - Image: installs `requirements-lock.txt` with `pip install --user` in a builder stage, copies `/root/.local` into the runtime stage, and patches `PYTHONPATH`.
- **The image build context is `packages/`, not `packages/backend/`.** So `packages/backend/.dockerignore` is never read, and the context includes `frontend/node_modules`. Its pnpm symlinks break local `podman build` from a working tree.
- **The Dockerfile copies about 25 modules one by one.** `test_packaging.py` guards that list statically: it walks imports from `main.py` and checks each module is copied. Every non-test module is reachable from `main.py` today, so "all non-test `.py` files" and "the modules the app imports" are the same set.
- **The built image is never run before it is pushed.** The build jobs only run on pushes to `master` and on tags, not on PRs, so a broken image is first discovered when it is deployed.
- **Python is 3.13 everywhere** after the recent alignment: `.python-version` (root and backend), `pyrightconfig.json`, CI, and `python:3.13-slim-bookworm` in the image. The image pins bookworm because the apt package names in the Dockerfile (`libgeos-c1v5`, …) are bookworm's.
- **uv is not installed** on the maintainer's machine yet.

## Goals / Non-Goals

**Goals:**
- One file, `pyproject.toml`, declares the dependencies and the Python version. One lock, `uv.lock`, is installed identically in dev, CI and the image, except that the image skips the dev group.
- A drift that would previously have gone unnoticed now fails CI. Four cases are covered: a lock out of date with `pyproject.toml`, a Python version mismatch between the image and the project, dev tools leaking into the image, and an image that doesn't start.
- Image contents are checked by running the image, not by statically mirroring the Dockerfile in a test. The per-file `COPY` list and its guards go away.
- Resolved versions are unchanged: the first `uv.lock` matches today's `requirements-lock.txt`.

**Non-Goals (design-level):**
- No optimization of the image's apt layers. For example, the build-only `gcc`/`libproj-dev` stage may no longer be needed now that every dependency ships a wheel, but removing it is a separate change.
- No `uv` workspace spanning `packages/tools`.

## Decisions

### D1. uv rather than Poetry, pip-tools or hatch

uv handles the lock, the venv, the Python install and command running in one fast binary. It reads standard `[project]` metadata and PEP 735 `[dependency-groups]`, so nothing in `pyproject.toml` is uv-specific except `[tool.uv]`.

- **pip-tools** would fix the lock (`pip-compile` with hashes) but not venv or Python management, and it keeps two requirements files.
- **Poetry** uses its own dependency syntax and is slower in CI and Docker.
- **hatch** is aimed at building and publishing packages, which this project does not do.

### D2. Virtual project (`[tool.uv] package = false`)

The backend is an application with flat modules, not a distributable. With `package = false`, uv installs only the dependencies and never tries to build or install the project itself, so no build backend and no package discovery are needed. This keeps the flat layout and the `../shared` path working unchanged.

- Rejected: a `[build-system]` with hatchling/setuptools and `py-modules`. It only matters if a wheel is ever built, which is a non-goal, and it would need the module list kept in sync, just like the Dockerfile.

### D3. The venv moves to `packages/backend/.venv`

`.venv` is uv's default, and the editor already knows it (`.vscode/settings.json` lists `.venv`).

- Rejected: keeping the `venv` name. That would mean setting `UV_PROJECT_ENVIRONMENT=venv` on every uv invocation (root scripts, CI, editors, ad-hoc shells). Forgetting it once would silently create a second venv.

Every place that names `venv` gets updated: the root scripts, `.gitignore`, `.vscode/settings.json`, the README and CI. The old `venv/` folder is gitignored and harmless, and the README tells developers to delete it.

### D4. Splitting runtime and dev dependencies

The split follows what non-test modules actually import, plus what the framework needs at runtime.

- **Runtime (`[project].dependencies`):**
  - fastapi, `uvicorn[standard]`, Pillow, cairosvg, pyproj, numpy, python-json-logger, python-dotenv, aiosqlite, yoyo-migrations, truststore, pycrdt, pycrdt-websocket
  - httpx, which `auth_routes.py` imports directly
  - httpx-oauth
  - itsdangerous, which no module imports directly but Starlette's `SessionMiddleware` needs at runtime
- **Dev (`[dependency-groups].dev`):** pytest, pytest-asyncio, pytest-watch, requests. No non-test module imports `requests`.

The specifiers stay as unversioned names, as in `requirements.txt` today. `uv.lock` governs the versions, and upgrades are an explicit `uv lock --upgrade[-package]`.

- Rejected: adding `>=` lower bounds now. They would be a set of version decisions this change doesn't need to make.

uv puts the `dev` group in by default for `uv sync` and `uv run`, so local and CI test runs need no flag. The image passes `--no-dev`.

### D5. The first lock reproduces today's versions

All the pins from `requirements-lock.txt` are added temporarily as `[tool.uv] constraint-dependencies`, and `uv lock` is run. Then the constraints are removed and `uv lock` is run again. uv prefers versions that are already locked, so the second run changes nothing.

The check: compare `uv export --no-hashes --all-groups` with the old `requirements-lock.txt`. The only expected differences are formatting and packages that `pip freeze` captured but nothing depends on. Each such difference must be explained before the old lock is deleted.

### D6. Docker install stage

The builder stage:
- copies a **pinned** uv binary from the official image (`COPY --from=ghcr.io/astral-sh/uv:<version> /uv /bin/uv`)
- copies `pyproject.toml`, `uv.lock` and `.python-version`
- runs `uv sync --locked --no-dev --no-install-project` with these settings:
  - `UV_COMPILE_BYTECODE=1`: precompile `.pyc` files for faster start-up
  - `UV_LINK_MODE=copy`: copy files from the cache instead of hard-linking, which doesn't work across Docker's mounts
  - `UV_PYTHON_DOWNLOADS=never`: use the image's Python and fail rather than download another one

The venv lands in `/app/.venv`. The runtime stage copies `/app/.venv` to the same path, because the venv's scripts contain absolute paths. It then puts `/app/.venv/bin` first on `PATH`. The `/root/.local` copy, the `PYTHONPATH` override and the `chown /root` disappear. `CMD ["uvicorn", …]` is unchanged and resolves to the venv's uvicorn.

The runtime stage does **not** contain uv. Only the builder needs it.

### D7. CI

The `test` job:
- replaces `actions/setup-python` and the pip steps with `astral-sh/setup-uv`, pinned to the same uv version as the Dockerfile, with caching enabled
- runs `uv sync --locked` in `packages/backend`, then `pnpm test:backend`

uv installs the Python named in `packages/backend/.python-version`. `--locked` fails the job if `uv.lock` is out of date with `pyproject.toml`; that check replaces the old "every requirement is in the lock" test.

### D8. Single source for the Python version, with a guard

`requires-python = ">=3.13,<3.14"` in `pyproject.toml` and `3.13` in `packages/backend/.python-version` are the source of truth. uv uses both. The root `.python-version` stays at 3.13 for tools that look at the repo root.

The Docker base image tag can't read either file, so a new test in `test_packaging.py` checks that every `FROM python:X.Y-…` in the Dockerfile matches `.python-version` and satisfies `requires-python`. That is the drift fixed by hand just before this change.

### D9. Tool configuration in `pyproject.toml`

- `pytest.ini` becomes `[tool.pytest.ini_options]` with the same keys and values.
- `pyrightconfig.json` becomes `[tool.pyright]` with the same settings plus `venvPath = "."` and `venv = ".venv"`. Both old files are deleted, because pyright gives `pyrightconfig.json` precedence over `pyproject.toml`.

### D10. Glob copy of the backend modules

The runtime stage copies application code with `COPY backend/*.py .`, keeping explicit lines only for the data directories (`theatres/`, `migrations/`) and `shared/pictogramCatalog.json`.

What the glob must not pick up is excluded by a new **`packages/.dockerignore`**, placed at the build context root where Docker and Podman actually read it:
- `backend/test_*.py`, `backend/.venv`, `backend/venv`, `backend/data`, `backend/config`, `backend/.env*`
- `**/__pycache__`, `**/.pytest_cache`
- `frontend/`, `tools/`: the backend image needs neither. Excluding them also shrinks the context and fixes local `podman build` from a working tree, which currently fails on `frontend/node_modules` symlinks.

The unread `packages/backend/.dockerignore` is deleted so nobody mistakes it for the one in effect.

The frontend image's build context is the repo root, so `packages/.dockerignore` does not affect it.

- Rejected: keeping the per-file list. That list, and the import-walking test that guards it, exist only because the copy is manual.
- Rejected: the `src/` package layout. It reaches the same "one COPY" result but rewrites every import, which is out of scope.

Trade-off: any `.py` file left at the backend root now ships in the image, including a scratch script. Such a file is harmless unless something imports it, and it shows up in `git status`.

### D11. CI smoke test of the built backend image

The `build-backend` job runs on **PRs too**, so a broken image blocks the merge rather than the deploy. It only pushes for non-PR events. The steps:

1. `docker/setup-qemu-action`. The image is `linux/arm64` and the runner is amd64, so running the container needs emulation.
2. `docker/build-push-action` with `load: true` and `push: false`, tagged `dcsplan-backend:smoke`.
3. Smoke step:
   - Start the container in the background with `--platform linux/arm64`. Poll `GET http://localhost:5001/` until it answers 200, with a timeout of about 90 s because emulation is slow.
     - Startup runs the lifespan hooks, so this proves the imports resolve and the sync and purge background tasks start.
   - `GET /theatres` returns a non-empty list, which proves `theatres/` was copied.
   - The number of rows in yoyo's `_yoyo_migration` table in the container's database equals the number of non-rollback `migrations/*.sql` files in the checkout.
     - A successful startup does **not** prove the migrations were applied. yoyo treats a missing `migrations/` directory as "no migrations", so the app starts on an empty database, and `/` and `/theatres` never touch it. This was found during implementation: an image without `COPY backend/migrations` passed the other checks.
   - `docker exec … python -c "import pytest"` must **fail**, which proves the dev group was excluded (`--no-dev`).
   - On failure, print `docker logs` before exiting non-zero.
4. If the event isn't a PR, run `docker/build-push-action` again with `push: true`. It reuses the GitHub Actions layer cache, so this is a re-tag and push, not a rebuild.

This replaces both the static module-copy guard and a static "`--no-dev` appears in the Dockerfile" check. A test of the running artifact covers both, plus lazily imported modules and data files, which the static guard couldn't see.

- Rejected: running the smoke test on an arm64 runner (`ubuntu-24.04-arm`). It's faster and needs no QEMU, but hosted arm64 runners depend on the repo's plan and visibility. QEMU works everywhere and can be swapped for an arm64 runner later without changing the steps.

### D12. What remains of `test_packaging.py`

Only the Python version check from D8. It reads `.python-version` and `pyproject.toml` (stdlib `tomllib`) and checks every `FROM python:X.Y…` line in the Dockerfile.

Everything else is removed:
- the module-copy guards and their self-tests (replaced by D10 and D11)
- `test_every_requirement_is_pinned_in_the_lock_file` and `test_requirement_names_are_normalized` (replaced by `uv sync --locked`, D7)

The file keeps its name, since it is still a packaging guard.

## Risks / Trade-offs

- [Developers or agents still call `./venv/bin/python`] → The root scripts are the documented entry points and keep their names. The README gets updated to say "use `uv run` / `.venv`".
- [uv missing on a machine] → `pnpm install:backend` fails fast with "uv: command not found". The README gives the one-line install (`brew install uv` or the official installer).
- [`uv sync` runs implicitly] → `uv run` syncs the venv first, so a stale venv fixes itself. A run may pause briefly after a lock change, which is acceptable.
- [The first lock differs from the pip freeze] → Mitigated by the D5 constraint-and-compare step. Any version difference blocks deletion of the old lock until explained.
- [The pinned uv version goes stale] → Bump it deliberately in both places: the Dockerfile `COPY --from` and the `setup-uv` `version`. A test could enforce that they match, but it isn't worth it for two lines.
- [Cross-platform lock] → `uv.lock` is universal, so the same lock resolves on macOS arm64 (dev), linux amd64 (CI test job) and linux arm64 (image). Verify by building the image as well as running the local sync.
- [PRs get slower: an emulated arm64 build plus a smoke run] → The layer cache keeps rebuilds to the changed layers. The smoke step polls instead of sleeping. If it becomes a bottleneck, move the job to an arm64 runner (D11).
- [The smoke step only proves that the app starts] → That is the failure the static guards existed for: a missing module or file means the container won't boot. Behaviour stays covered by the pytest suite.
- [A stray `.py` file ships in the image] → Accepted (D10).

## Migration Plan

1. Land everything in one change. Partial states, such as Docker on uv but CI on pip, are exactly the drift being removed.
2. After merging, each developer installs uv, deletes `packages/backend/venv`, and runs `pnpm install:backend`.
3. Deployment is unchanged: CI builds and pushes the image, and Podman pulls it. The runtime contract (port 5001, `/app/data` volume, env vars, CMD) is unchanged.
4. Rollback: revert the change. The old requirements files come back with it.
