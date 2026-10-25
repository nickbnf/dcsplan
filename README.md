# dcsplan: a tactical planner

dcsplan is a web app helping plan missions for combat flight simulators such as DCS. Its main advantage is to generate detailed kneeboards allowing mission following and navigation, even in aircrafts with limited onboard systems (such as 60s era jets).

An online server is accessible at https://dcsplan.bonnefon.org/

## Main features

 * Online edition of flight plans
 * Maps from DCS itself for accuracy of landmarks in the sim
 * Generate kneeboards, one page per leg
 * Draw accurate turns based on ground speed and bank angle

## Project Structure

This is a monorepo using pnpm workspaces.

- `packages/frontend`: Vite/React/TypeScript front-end application.
- `packages/backend`: FastAPI/Python back-end application.

## Getting Started

### Prerequisites

- Node.js 24 and pnpm (the version is pinned by `packageManager` in `package.json`; `corepack enable` picks it up)
- [uv](https://docs.astral.sh/uv/) (`brew install uv`). It installs the Python version the backend needs (3.13, from `packages/backend/.python-version`) if you don't have it.

### Installation

1.  **Install front-end dependencies:**
    From the root of the project, run:
    ```bash
    pnpm install
    ```
    This will install dependencies for the root workspace and the front-end package (once it's created).

2.  **Set up and install back-end dependencies:**
    This runs `uv sync`, which creates `packages/backend/.venv` and installs the locked dependencies from `packages/backend/uv.lock` (runtime and dev).
    ```bash
    pnpm run install:backend
    ```
    If you have an old `packages/backend/venv` from before the move to uv, delete it.

    Dependencies are declared in `packages/backend/pyproject.toml`. To add or upgrade one, use uv from `packages/backend` (`uv add <pkg>`, `uv add --dev <pkg>`, `uv lock --upgrade-package <pkg>`) and commit `uv.lock`. To run any other backend command in the environment, prefix it with `uv run` (for example `uv run python -m some_module`).

### Running the Development Servers

To run both the front-end and back-end servers concurrently, use the following command from the root directory:

```bash
pnpm dev
```

- The front-end (Vite) will be available at `http://localhost:5173` (or the next available port).
- The back-end (FastAPI) will be available at `http://localhost:8000`.

### Running the Tests

To run all tests (back-end and front-end):

```bash
pnpm test
```

To run back-end tests only:

```bash
pnpm test:backend
```

To run front-end tests only:

```bash
pnpm test:frontend
```
