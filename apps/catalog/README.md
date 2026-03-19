# Catalog Service

This app is the external website and API used by the Chrome extension.

## Runtime Split

- `/` serves the human-facing catalog homepage.
- `/submit` serves the public package-submission page.
- `/api/v1/*` serves machine-readable JSON for the extension and any future clients.
- `/health` remains a simple health check.

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

## Extension-Aware Catalog Page

When the extension is installed and has access to the catalog origin, the catalog homepage can:
- detect the extension on the page via an injected content script
- show the current scenario root and title
- confirm the install target before writing scripts
- trigger `One-Click Install` directly from catalog cards into the root scenario and playable leaves
- trigger `Rollback Latest` from the matching package card when a restore point exists for that package
- fall back to a bundled placeholder thumbnail when a package manifest omits `thumbnailUrl`

If the catalog moves to a new external domain, save that origin in the extension popup so the extension can request access and register the catalog-site bridge there too.

## Submission Workflow

The catalog also accepts public package submissions:
- `/submit` provides the public upload form
- `POST /api/v1/submissions` stores submissions into the private pending queue
- there is intentionally no public admin interface in the MVP
- review is completed locally on the host via CLI only

Local review commands:

Windows:

```powershell
.\scripts\review-submissions.ps1 list pending
.\scripts\review-submissions.ps1 show <submissionId>
.\scripts\review-submissions.ps1 approve <submissionId> --reviewer Flyer --notes "Validated manually"
```

Linux:

```bash
./scripts/review-submissions.sh list pending
./scripts/review-submissions.sh show <submissionId>
./scripts/review-submissions.sh approve <submissionId> --reviewer Flyer --notes "Validated manually"
```

## Data Locations

- Package manifests: [data/packages](/C:/github/AID-OneClick/apps/catalog/data/packages)
- Submission queue: [data/submissions](/C:/github/AID-OneClick/apps/catalog/data/submissions)
- Telemetry runtime files: [data/runtime](/C:/github/AID-OneClick/apps/catalog/data/runtime)
- Static site assets: [public](/C:/github/AID-OneClick/apps/catalog/public)
- HTTP server entrypoint: [src/server.js](/C:/github/AID-OneClick/apps/catalog/src/server.js)
