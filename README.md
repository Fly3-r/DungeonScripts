# AID-OneClick

Scaffold for the AI Dungeon one-click installer project.

This repo now follows the MVP split described in [INSTALLER_MVP_SPEC.md](/C:/github/AID-OneClick/INSTALLER_MVP_SPEC.md):
- `apps/extension` is the Chrome extension client
- `apps/catalog` is the external catalog/API service
- `packages/contracts` holds shared manifest and telemetry shapes
- `docs/design-decisions.md` records product and architecture decisions
- `docs/agent-decisions.md` records workflow and agent execution decisions

## Layout

```text
apps/
  catalog/       External website/API, Docker-friendly
  extension/     Chrome extension loaded as unpacked
packages/
  contracts/     Shared JSON schema and examples
docs/
  design-decisions.md
  agent-decisions.md
```

## Quick Start

1. Start the external catalog/API:

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
- the catalog origin points at `http://127.0.0.1:3000`

5. Select a package in the popup and click `Install To Leaves`.

6. If needed, click `Rollback Latest` to restore the most recent pre-install snapshot.

## Current State

This scaffold includes:
- root workspace configuration
- minimal unpacked-extension shell
- AI Dungeon editor detection and auth token extraction plumbing
- authenticated AI Dungeon scenario reads and leaf discovery
- restore-point capture before script mutations
- catalog package fetch and install-to-leaf execution
- rollback of the latest restore point from the popup
- best-effort anonymous install-success telemetry POSTs to the external catalog/API
- minimal catalog/API server
- Dockerfile for the external service
- sample package manifest
- shared JSON schemas for package and telemetry payloads

What is not implemented yet:
- durable telemetry retry queue inside the extension
- install diff preview before overwrite
- restore-point browsing beyond the latest snapshot
- automated test coverage for the install and rollback flow

## Decision Logs

- Design and product decisions live in [docs/design-decisions.md](/C:/github/AID-OneClick/docs/design-decisions.md).
- Agent and workflow decisions live in [docs/agent-decisions.md](/C:/github/AID-OneClick/docs/agent-decisions.md).
