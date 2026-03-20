# AID-OneClick

Scaffold for the AI Dungeon one-click installer project.

This repo now follows the MVP split described in [INSTALLER_MVP_SPEC.md](/C:/github/AID-OneClick/INSTALLER_MVP_SPEC.md):
- `apps/extension` is the Chrome extension client
- `apps/catalog` is the external catalog/API service
- `packages/contracts` holds shared manifest and telemetry shapes
- `docs/design-decisions.md` records product and architecture decisions
- `docs/agent-decisions.md` records workflow and agent execution decisions
- `docs/repo-package-model.md` records the repo-driven package source layout

## Layout

```text
apps/
  catalog/       External website/API, Docker Compose-friendly
  extension/     Chrome extension loaded as unpacked
packages/
  contracts/     Shared JSON schema and examples
docs/
  design-decisions.md
  agent-decisions.md
  repo-package-model.md
```

## Quick Start

1. Start the external catalog/API with Docker Compose:

   ```powershell
   npm run catalog:compose:up
   ```

2. Open Chrome and load [apps/extension](/C:/github/AID-OneClick/apps/extension) as an unpacked extension.

3. Open an AI Dungeon scenario edit page.

4. Use the catalog homepage at `/` to browse packages and install them through the extension.

5. Add or update package sources under [apps/catalog/data/scripts](/C:/github/AID-OneClick/apps/catalog/data/scripts), then restart the catalog to regenerate package manifests.

## Current State

This scaffold includes:
- root workspace configuration
- minimal unpacked-extension shell
- AI Dungeon editor detection and auth token extraction plumbing
- authenticated AI Dungeon scenario reads and leaf discovery
- restore-point capture before script mutations
- catalog package fetch and install-to-root-plus-leaves execution
- rollback of the latest restore point from the popup and matching catalog card
- best-effort anonymous install-success telemetry POSTs to the external catalog/API
- browsable catalog homepage on `/` with thumbnail cards, fallback placeholder artwork, and install counters
- versioned JSON API under `/api/v1/*`
- repo-driven package sources under `apps/catalog/data/scripts/<package-id>`
- startup generation of public package manifests into `apps/catalog/data/packages`
- sample package source files and shared JSON schemas for package metadata, package manifests, and telemetry payloads
- a repeatable Chrome DevTools Protocol regression script for install and rollback verification

What is not implemented yet:
- durable telemetry retry queue inside the extension
- install diff preview before overwrite
- restore-point browsing beyond the latest snapshot
- branch-by-branch automated verification beyond the active root scenario
- public package detail pages beyond the homepage cards
- in-app package submission or moderation flows
- automated policy or malware scanning of package changes

## Package Source Model

- Package source-of-truth now lives under [apps/catalog/data/scripts](/C:/github/AID-OneClick/apps/catalog/data/scripts).
- Each package directory contains `metadata.json`, `Library.js`, `Input.js`, `Context.js`, `Output.js`, and an optional `Thumbnail.png`.
- The catalog rebuilds [apps/catalog/data/packages](/C:/github/AID-OneClick/apps/catalog/data/packages) from those source folders when the service starts.
- The source layout is defined in [repo-package-model.md](/C:/github/AID-OneClick/docs/repo-package-model.md).

## Automation Testing

- End-to-end install and rollback regression coverage now lives in [docs/testing.md](/C:/github/AID-OneClick/docs/testing.md).
- Run it with `npm run test:e2e:install`.
- The harness expects Chrome remote debugging on `127.0.0.1:9222`, plus open AI Dungeon and catalog tabs.

## Catalog Runtime

- The containerized catalog service is defined in [docker-compose.yml](/C:/github/AID-OneClick/docker-compose.yml).
- The human-facing catalog is served from `/`.
- The machine-facing API is served from `/api/v1/*`.
- Runtime telemetry files are persisted under [apps/catalog/data/runtime](/C:/github/AID-OneClick/apps/catalog/data/runtime).
- Repo-authored package source files live under [apps/catalog/data/scripts](/C:/github/AID-OneClick/apps/catalog/data/scripts).
- Generated package manifests are written under [apps/catalog/data/packages](/C:/github/AID-OneClick/apps/catalog/data/packages).
- Additional catalog runtime notes live in [apps/catalog/README.md](/C:/github/AID-OneClick/apps/catalog/README.md).

## Decision Logs

- Design and product decisions live in [docs/design-decisions.md](/C:/github/AID-OneClick/docs/design-decisions.md).
- Agent and workflow decisions live in [docs/agent-decisions.md](/C:/github/AID-OneClick/docs/agent-decisions.md).
