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

- Node.js (v18+) and pnpm
- Python (v3.8+)

### Installation

1.  **Install front-end dependencies:**
    From the root of the project, run:
    ```bash
    pnpm install
    ```
    This will install dependencies for the root workspace and the front-end package (once it's created).

2.  **Set up and install back-end dependencies:**
    This command will create a Python virtual environment in `packages/backend/venv` and install the required packages.
    ```bash
    pnpm run install:backend
    ```

### Running the Development Servers

To run both the front-end and back-end servers concurrently, use the following command from the root directory:

```bash
pnpm dev
```

- The front-end (Vite) will be available at `http://localhost:5173` (or the next available port).
- The back-end (FastAPI) will be available at `http://localhost:8000`.
