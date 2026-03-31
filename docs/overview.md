# DungeonScripts Overview

Scaffold for the DungeonScripts catalog and browser extension.

This repo now follows the MVP split described in [INSTALLER_MVP_SPEC.md](../INSTALLER_MVP_SPEC.md):
- `apps/extension` is the browser extension client
- `apps/catalog` is the external catalog/API service
- `packages/contracts` holds shared manifest and telemetry shapes
- `docs/design-decisions.md` records product and architecture decisions
- `docs/agent-decisions.md` records workflow and agent execution decisions
- `docs/repo-package-model.md` records the repo-driven package source layout

## Layout

```text
apps/
  catalog/       External website/API, Docker Compose-friendly
  extension/     Browser extension source plus Chrome/Firefox build targets
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

2. Load [apps/extension](../apps/extension) in Chrome, or run `npm run extension:sync:artifacts` and use the packaged browser builds from the repo-root `dist/` folder.

3. Open an AI Dungeon scenario edit page.

4. Use the catalog homepage at `/` to browse packages and install them through the extension.

5. Add or update package sources under [apps/catalog/data/scripts](../apps/catalog/data/scripts), then restart the catalog to regenerate package manifests.

## Current State

This scaffold includes:
- root workspace configuration
- minimal unpacked-extension shell
- AI Dungeon editor detection and auth token extraction plumbing
- authenticated AI Dungeon scenario reads and leaf discovery
- restore-point capture before script mutations
- catalog package fetch and install execution across selectable root and leaf targets
- rollback of the latest restore point from the popup and matching catalog card
- durable anonymous install-success telemetry queueing with retry in the extension
- browsable catalog homepage on `/` with thumbnail cards, fallback placeholder artwork, and install counters
- in-page install target-selection modal on the catalog with default-checked root and leaf targets
- in-page preview diff modal before overwrite across the full install target set
- versioned JSON API under `/api/v1/*`
- repo-driven package sources under `apps/catalog/data/scripts/<package-id>`
- startup generation of public package manifests into `apps/catalog/data/packages`
- sample package source files and shared JSON schemas for package metadata, package manifests, and telemetry payloads
- a repeatable Chrome DevTools Protocol regression script for install selection, telemetry retry, and full-target install/rollback verification
- a Firefox desktop build target that reuses the same extension runtime with a Firefox-specific manifest

## Package Source Model

- Package source-of-truth now lives under [apps/catalog/data/scripts](../apps/catalog/data/scripts).
- Each package directory contains `metadata.json`, `Library.js`, `Input.js`, `Context.js`, `Output.js`, and an optional `Thumbnail.png`.
- The catalog rebuilds [apps/catalog/data/packages](../apps/catalog/data/packages) from those source folders when the service starts.
- The source layout is defined in [repo-package-model.md](repo-package-model.md).

## Automation Testing

- End-to-end install and rollback regression coverage now lives in [testing.md](testing.md).
- Run it with `npm run test:e2e:install`.
- The harness expects Chrome remote debugging on `127.0.0.1:9222`, plus open AI Dungeon and catalog tabs.

## Catalog Runtime

- The containerized catalog service is defined in [docker-compose.yml](../docker-compose.yml).
- The human-facing catalog is served from `/`.
- The machine-facing API is served from `/api/v1/*`.
- Runtime telemetry files are persisted under [apps/catalog/data/runtime](../apps/catalog/data/runtime).
- Repo-authored package source files live under [apps/catalog/data/scripts](../apps/catalog/data/scripts).
- Generated package manifests are written under [apps/catalog/data/packages](../apps/catalog/data/packages).
- Additional catalog runtime notes live in [apps/catalog/README.md](../apps/catalog/README.md).

## Decision Logs

- Design and product decisions live in [design-decisions.md](design-decisions.md).
- Agent and workflow decisions live in [agent-decisions.md](agent-decisions.md).
