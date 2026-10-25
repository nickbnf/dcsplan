# Tasks

## 1. Project definition and lock

- [x] 1.1 Install uv locally (`brew install uv`) and pick the uv version to pin for this change (D6, D7). Verify: `uv --version` prints that version.
- [x] 1.2 Create `packages/backend/pyproject.toml` with:
  - `[project]` (name `dcsplan-backend`, `requires-python = ">=3.13,<3.14"`)
  - the runtime dependencies from D4
  - `[dependency-groups].dev` = pytest, pytest-asyncio, pytest-watch, requests
  - `[tool.uv] package = false`

  Verify: `uv lock` in `packages/backend` resolves without errors.
- [x] 1.3 Reproduce today's versions (D5):
  1. Add every pin from `requirements-lock.txt` as temporary `[tool.uv] constraint-dependencies` and run `uv lock`.
  2. Remove the constraints and run `uv lock` again.
  3. Diff `uv export --no-hashes --all-groups` against `requirements-lock.txt`.

  Verify: no package changes version, and every added or removed package is explained in the PR description.
- [x] 1.4 Move the `pytest.ini` settings into `[tool.pytest.ini_options]` and the `pyrightconfig.json` settings into `[tool.pyright]` (plus `venvPath = "."`, `venv = ".venv"`), then delete both old files (D9). Verify: `uv run pytest --co -q` collects the same number of tests as `./venv/bin/python -m pytest --co -q` did before.
- [x] 1.5 Run `uv sync` and the full suite with `uv run pytest`. Verify: same pass/fail result as the old venv run.

## 2. Dev workflow

- [x] 2.1 Rewrite the root `package.json` backend scripts, keeping their names:
  - `install:backend` → `uv sync`
  - `lock:backend` → `uv lock`
  - `dev:backend` → `uv run uvicorn main:app --reload`
  - `test:backend` → `uv run pytest -v`
  - `test:backend:watch` → `uv run ptw -- -v`

  Each runs from `packages/backend`. Verify: `pnpm install:backend`, `pnpm test:backend` and `pnpm dev` (backend answers on :8000 through the Vite `/api` proxy) all work from a fresh clone with no `venv/`.
- [x] 2.2 Replace the `venv` references with `.venv` in `.gitignore` and `.vscode/settings.json` (D3). Verify: `git status` doesn't list `packages/backend/.venv`.
- [x] 2.3 Update the README setup section: install uv, run `pnpm install:backend`, delete the old `packages/backend/venv`, and use `uv run` for ad-hoc commands. Verify: following the README on a clean checkout produces a working backend.
- [x] 2.4 Delete `requirements.txt` and `requirements-lock.txt`. Verify: `git grep -n "requirements\(-lock\)\?\.txt" -- . ':!packages/tools' ':!openspec/changes/archive'` returns nothing.

## 3. Container image

- [x] 3.1 Rewrite the backend Dockerfile install stage as in D6:
  - pinned `COPY --from=ghcr.io/astral-sh/uv:<version>`
  - copy `pyproject.toml`, `uv.lock` and `.python-version`
  - `uv sync --locked --no-dev --no-install-project` with `UV_COMPILE_BYTECODE=1`, `UV_LINK_MODE=copy` and `UV_PYTHON_DOWNLOADS=never`

  The runtime stage copies `/app/.venv` and prepends `/app/.venv/bin` to `PATH`. Drop the `/root/.local` copy, the `PYTHONPATH` override and the `chown /root`. Verify: the image builds (see 3.4).
- [x] 3.2 Glob copy (D10):
  - Replace the per-module `COPY backend/<name>.py .` lines with `COPY backend/*.py .`, keeping `theatres/`, `migrations/` and the pictogram catalog explicit.
  - Add `packages/.dockerignore` with the exclusions from D10.
  - Delete `packages/backend/.dockerignore`.

  Verify: in the built image, `ls /app/*.py` lists the same modules as `ls packages/backend/*.py | grep -v test_`, and no `test_*.py` file is present.
- [x] 3.3 Cut `test_packaging.py` down to the Python version check (D8, D12). Remove the module-copy guards, their self-tests and the requirements/lock tests, and add a `tomllib`-based test checking every `FROM python:X.Y…` against `.python-version` and `requires-python`. Verify: `pnpm test:backend` passes, and the test fails when one `FROM` is changed to 3.12 by hand.
- [x] 3.4 Build the image locally **from the working tree** (`podman build -f backend/Dockerfile -t dcsplan-backend:smoke .` in `packages/`). This build failed on `frontend/node_modules` symlinks before 3.2. Then run the D11 smoke checks by hand: start the container, then check `/` returns 200, `/theatres` returns a non-empty list, and `python -c "import pytest"` fails. Verify: all checks pass, and the image is smaller than the current one.

## 4. CI

- [x] 4.1 In the `test` job of `.github/workflows/ci.yml`, replace `actions/setup-python` and the pip install steps with `astral-sh/setup-uv` (same uv version as the Dockerfile, cache enabled) and `uv sync --locked` in `packages/backend`, keeping `pnpm test:backend` (D7). Verify: the job passes on a PR.
- [x] 4.2 Restructure `build-backend` as in D11:
  - run it on PRs too
  - add `docker/setup-qemu-action`
  - build with `load: true`, then run the smoke step (poll `/` with about a 90 s timeout, check `/theatres`, check `import pytest` fails, print `docker logs` on failure)
  - push only when `github.event_name != 'pull_request'`

  Verify: on a PR the job builds and smoke-tests without pushing, and on `master` it also pushes the usual tags.
- [x] 4.3 Check that the lock check bites. On a throwaway branch, add a dependency to `pyproject.toml` without re-locking. Verify: the `test` job fails at `uv sync --locked`.
- [x] 4.4 Check that the smoke test bites. On a throwaway branch, delete the `COPY backend/migrations ./migrations` line. Verify: `build-backend` fails in the smoke step and shows the container logs, and nothing is pushed.

## Workflow follow-up

- After merging, each developer runs `brew install uv`, then `rm -rf packages/backend/venv`, then `pnpm install:backend`.
- Archive the change once the CI-built image is deployed and the backend runs normally.
