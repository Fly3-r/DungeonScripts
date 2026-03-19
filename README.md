# AID-OneClick

Scaffold for the AI Dungeon one-click installer project.

This repo now follows the MVP split described in [INSTALLER_MVP_SPEC.md](/C:/github/AID-OneClick/INSTALLER_MVP_SPEC.md):
- `apps/extension` is the Chrome extension client
- `apps/catalog` is the external catalog/API service
- `packages/contracts` holds shared manifest and telemetry shapes
- `docs/design-decisions.md` records product and architecture decisions
- `docs/agent-decisions.md` records workflow and agent execution decisions
- `docs/upload-review-mvp.md` records the submission and manual review workflow

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
  upload-review-mvp.md
```

## Quick Start

1. Start the external catalog/API with Docker Compose:

   ```powershell
   npm run catalog:compose:up
   ```

   To stop it later:

   ```powershell
   npm run catalog:compose:down
   ```

   If you want to run the catalog directly without Docker, you can still use:

   ```powershell
   npm run catalog:dev
   ```

2. Open Chrome and load [apps/extension](/C:/github/AID-OneClick/apps/extension) as an unpacked extension.

3. Open an AI Dungeon scenario edit page.

4. Open the extension popup and confirm:
- the editor URL is detected
- the auth token status is active
- scenario access resolves successfully
- the leaf count matches the current scenario tree
- the catalog origin points at your catalog site

5. Open the catalog homepage at `/` and confirm the extension bridge shows the current scenario root before installing.

6. Click `One-Click Install` from the catalog page or `Install To Targets` from the popup.

7. If needed, click `Rollback Latest` in the popup or from the matching catalog card to restore the most recent pre-install snapshot.

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
- public `/submit` page for package uploads into a private review queue
- file-backed submission records with private uploader Discord usernames
- local-only Windows and Linux review CLI tooling with no public admin page
- catalog-page extension bridge that shows the current scenario root and can trigger installs
- repo-root Docker Compose stack for the external catalog/API
- sample package manifest and thumbnail asset
- shared JSON schemas for package, submission, and telemetry payloads
- a repeatable Chrome DevTools Protocol regression script for install and rollback verification

What is not implemented yet:
- durable telemetry retry queue inside the extension
- install diff preview before overwrite
- restore-point browsing beyond the latest snapshot
- branch-by-branch automated verification beyond the active root scenario
- public package detail pages beyond the homepage cards
- uploader resubmission/edit flows after review
- automated policy or malware scanning of submissions

## Submission Review

- Public uploads are accepted from `/submit` and stored under [apps/catalog/data/submissions](/C:/github/AID-OneClick/apps/catalog/data/submissions).
- There is intentionally no public `/admin` page in the MVP.
- Review is handled locally on the host with:
  - [review-submissions.ps1](/C:/github/AID-OneClick/scripts/review-submissions.ps1) on Windows
  - [review-submissions.sh](/C:/github/AID-OneClick/scripts/review-submissions.sh) on Linux
  - [review-submissions.mjs](/C:/github/AID-OneClick/scripts/review-submissions.mjs) as the shared implementation
- Approved submissions are published into [apps/catalog/data/packages](/C:/github/AID-OneClick/apps/catalog/data/packages).
- The private submission workflow is defined in [upload-review-mvp.md](/C:/github/AID-OneClick/docs/upload-review-mvp.md).

## Automation Testing

- End-to-end install and rollback regression coverage now lives in [docs/testing.md](/C:/github/AID-OneClick/docs/testing.md).
- Run it with `npm run test:e2e:install`.
- The harness expects Chrome remote debugging on `127.0.0.1:9222`, plus open AI Dungeon and catalog tabs.
- The current harness verifies the active root scenario end to end and records discovered leaf targets for future branch-level coverage.

## Catalog Runtime

- The containerized catalog service is defined in [docker-compose.yml](/C:/github/AID-OneClick/docker-compose.yml).
- The human-facing catalog is served from `/`.
- The public submission page is served from `/submit`.
- The machine-facing API is served from `/api/v1/*`.
- Runtime telemetry files are persisted under [apps/catalog/data/runtime](/C:/github/AID-OneClick/apps/catalog/data/runtime).
- Catalog package manifests remain in [apps/catalog/data/packages](/C:/github/AID-OneClick/apps/catalog/data/packages).
- Submission queue files are persisted under [apps/catalog/data/submissions](/C:/github/AID-OneClick/apps/catalog/data/submissions).
- Additional catalog runtime notes live in [apps/catalog/README.md](/C:/github/AID-OneClick/apps/catalog/README.md).

## Decision Logs

- Design and product decisions live in [docs/design-decisions.md](/C:/github/AID-OneClick/docs/design-decisions.md).
- Agent and workflow decisions live in [docs/agent-decisions.md](/C:/github/AID-OneClick/docs/agent-decisions.md).
