# Catalog Service

This app is the external website and API used by the Chrome extension.

## Runtime Split

- `/` serves the human-facing catalog homepage.
- `/submit` serves the public package-submission page.
- `/admin` serves the protected submission-review page.
- `/api/v1/*` serves machine-readable JSON for the extension and future clients.
- `/health` remains a simple health check.

## Docker Compose

The default containerized runtime is the repo-root [docker-compose.yml](/C:/github/AID-OneClick/docker-compose.yml).

The compose service:
- builds from [Dockerfile](/C:/github/AID-OneClick/apps/catalog/Dockerfile)
- exposes the catalog on `http://127.0.0.1:3000`
- passes through `CATALOG_ADMIN_USERNAME` and `CATALOG_ADMIN_PASSWORD`
- persists package manifests, submission queue files, and telemetry data under [data](/C:/github/AID-OneClick/apps/catalog/data)

## Direct Node Runtime

If you do not want to use Docker, run the server directly:

```powershell
npm run catalog:dev
```

## Submission Workflow

The catalog accepts public package submissions and reviews them in-app:
- `/submit` provides the public upload form
- `POST /api/v1/submissions` stores submissions into the private pending queue
- `/admin` provides the protected review interface
- `GET /api/v1/admin/submissions` and `POST /api/v1/admin/submissions/:id/review` power the review page
- admin access is protected with HTTP Basic Auth using `CATALOG_ADMIN_USERNAME` and `CATALOG_ADMIN_PASSWORD`

## Data Locations

- Package manifests: [data/packages](/C:/github/AID-OneClick/apps/catalog/data/packages)
- Submission queue: [data/submissions](/C:/github/AID-OneClick/apps/catalog/data/submissions)
- Telemetry runtime files: [data/runtime](/C:/github/AID-OneClick/apps/catalog/data/runtime)
- Static site assets: [public](/C:/github/AID-OneClick/apps/catalog/public)
- HTTP server entrypoint: [src/server.js](/C:/github/AID-OneClick/apps/catalog/src/server.js)
