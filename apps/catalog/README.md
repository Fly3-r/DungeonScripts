# Catalog Service

This app is the external website and API used by the DungeonScripts browser extension.

## Runtime Split

- `/` serves the human-facing catalog homepage.
- `/api/v1/*` serves machine-readable JSON for the extension and future clients.
- `/health` remains a simple health check.

## Docker Compose

The default containerized runtime is the repo-root [docker-compose.yml](../../docker-compose.yml).

The compose service:
- builds from [Dockerfile](Dockerfile)
- exposes the catalog on `http://127.0.0.1:3000`
- passes through `DEFAULT_MIN_INSTALLER_VERSION`
- persists package source files, generated package manifests, and telemetry data under [data](data)

## Direct Node Runtime

If you do not want to use Docker, run the server directly:

```powershell
npm run catalog:dev
```

## Package Workflow

The catalog now uses a repo-driven package model:
- package source-of-truth lives under [data/scripts](data/scripts)
- each package folder contains `metadata.json`, `Library.js`, `Input.js`, `Context.js`, `Output.js`, and an optional `Thumbnail.png`
- the catalog rebuilds [data/packages](data/packages) from those source folders each time the service starts
- install counts remain in runtime telemetry and are still keyed by package ID

## Data Locations

- Package source tree: [data/scripts](data/scripts)
- Generated package manifests: [data/packages](data/packages)
- Telemetry runtime files: [data/runtime](data/runtime)
- Static site assets: [public](public)
- HTTP server entrypoint: [src/server.js](src/server.js)

