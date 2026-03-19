# Catalog Service

This app is the external website and API used by the Chrome extension.

## Docker Compose

The default containerized runtime is the repo-root [docker-compose.yml](/C:/github/AID-OneClick/docker-compose.yml).

Start the service:

```powershell
npm run catalog:compose:up
```

Follow logs:

```powershell
npm run catalog:compose:logs
```

Stop the service:

```powershell
npm run catalog:compose:down
```

The compose service:
- builds from [Dockerfile](/C:/github/AID-OneClick/apps/catalog/Dockerfile)
- exposes the catalog on `http://127.0.0.1:3000`
- persists telemetry output in [data/runtime](/C:/github/AID-OneClick/apps/catalog/data/runtime)

## Direct Node Runtime

If you do not want to use Docker, run the server directly:

```powershell
npm run catalog:dev
```

## Data Locations

- Package manifests: [data/packages](/C:/github/AID-OneClick/apps/catalog/data/packages)
- Telemetry runtime files: [data/runtime](/C:/github/AID-OneClick/apps/catalog/data/runtime)
- Static site assets: [public](/C:/github/AID-OneClick/apps/catalog/public)
- HTTP server entrypoint: [src/server.js](/C:/github/AID-OneClick/apps/catalog/src/server.js)
