# Upload And Review MVP

This document defines the current submission and review workflow for the external catalog.

## Goals

- Accept public package submissions from a hosted `/submit` page.
- Review and approve submissions from a webpage inside the catalog app.
- Keep uploader contact details private while still exposing publishable package metadata.
- Publish approved packages into the existing manifest store used by the extension and catalog.

## Public Submission Flow

1. A package author opens `/submit`.
2. The author enters package metadata and the four AI Dungeon script fields.
3. The catalog stores the submission as a private file-backed record in the `pending` queue.
4. The site returns a submission ID and does not publish the package immediately.
5. A reviewer opens `/admin`, authenticates with the catalog admin credentials, and inspects the queued submission.
6. The reviewer approves it, rejects it, or marks it as needing changes.
7. Approval writes or updates the public package manifest under `apps/catalog/data/packages`.

## Admin Access

The review page lives at `/admin` and is protected with HTTP Basic Auth inside the catalog service.

Environment variables:
- `CATALOG_ADMIN_USERNAME`
- `CATALOG_ADMIN_PASSWORD`

For the Docker runtime, these values are passed into the catalog container through `docker-compose.yml`.

## Submission Fields

Required public package fields:
- `packageId`
- `name`
- `version`
- `authorProfileUrl`
- `description`
- `sharedLibrary`
- `onInput`
- `onModelContext`
- `onOutput`

Optional public package fields:
- `thumbnailUrl`

Required private submission-only fields:
- `discordUsername`

Derived fields:
- `author`
- `minInstallerVersion`
- `hash`

## Privacy Rules

- `discordUsername` stays in submission records only.
- Public package APIs and manifests must not expose `discordUsername`.
- Submission queue files remain private host data and should not be published as static assets.
- Runtime submission JSON files stay git-ignored to reduce accidental commits of private contact data.

## File-Backed Storage Model

Submission records live under `apps/catalog/data/submissions` and move between status directories:

```text
apps/catalog/data/submissions/
  pending/
  approved/
  rejected/
  needs_changes/
```

Published packages remain in:

```text
apps/catalog/data/packages/
  <packageId>.json
```

## Review Behavior

Approving a submission performs these steps:

1. Load the pending submission.
2. Build the public package manifest.
3. Compute a deterministic package hash from the public manifest contents.
4. Write or update `apps/catalog/data/packages/<packageId>.json`.
5. Move the submission record into `approved` with reviewer and publish metadata.

Rejecting or marking a submission as needing changes moves the record into the matching queue and stores reviewer notes.

## HTTP Surface

Public pages:
- `GET /`
- `GET /submit`

Protected admin page:
- `GET /admin`

Public API:
- `GET /api/v1/packages`
- `GET /api/v1/packages/:id`
- `POST /api/v1/telemetry/install-success`
- `POST /api/v1/submissions`

Protected admin API:
- `GET /api/v1/admin/status`
- `GET /api/v1/admin/submissions`
- `GET /api/v1/admin/submissions/:id`
- `POST /api/v1/admin/submissions/:id/review`

## Out Of Scope For This MVP

- public package detail pages
- uploader authentication
- reviewer user accounts beyond shared admin credentials
- uploader edit/resubmit flows
- file upload handling for thumbnails
- automated malware or policy scanning
- notification delivery
