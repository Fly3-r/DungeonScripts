# Upload And Review MVP

This document defines the first upload and review workflow for the external catalog.

## Goals

- Accept public package submissions from a hosted `/submit` page.
- Keep review private and host-local, with no public `/admin` page.
- Preserve uploader contact details privately for follow-up.
- Publish approved submissions into the existing package manifest store used by the catalog and extension.

## Public Submission Flow

1. A package author opens `/submit`.
2. The author enters package metadata and the four AI Dungeon script fields.
3. The site stores the submission as a private file-backed record in the `pending` queue.
4. The site returns a submission ID and does not publish the package immediately.
5. A local reviewer inspects the queued submission with the host CLI and either approves it, rejects it, or marks it as needing changes.
6. Approval writes or updates the public package manifest under `apps/catalog/data/packages`.

## Submission Fields

Required public package fields:
- `packageId`: stable lowercase slug used as the published package manifest ID.
- `name`
- `version`
- `authorProfileUrl`: must be an AI Dungeon profile URL such as `https://play.aidungeon.com/profile/Fly3_r`.
- `description`: long Markdown-capable text. Markdown links are allowed.
- `sharedLibrary`
- `onInput`
- `onModelContext`
- `onOutput`

Optional public package fields:
- `thumbnailUrl`: if omitted, the catalog falls back to the bundled placeholder thumbnail.

Required private submission-only fields:
- `discordUsername`: stored only in the submission record so the host can contact the uploader if needed.

Derived fields:
- `author`: derived from the final path segment of `authorProfileUrl` for public display.
- `minInstallerVersion`: assigned by the catalog during publish.
- `hash`: assigned by the review CLI during publish.

## Privacy Rules

- `discordUsername` stays in submission records only.
- Public package APIs and manifests must not expose `discordUsername`.
- No submission listing or review endpoint is exposed over the public HTTP API.
- Review is completed locally on the host through CLI tooling only.

## File-Backed Storage Model

Submission records live under `apps/catalog/data/submissions` and move between status directories:

```text
apps/catalog/data/submissions/
  pending/
  approved/
  rejected/
  needs_changes/
```

Each submission is stored as one JSON file named `<submissionId>.json`.

Published packages remain in:

```text
apps/catalog/data/packages/
  <packageId>.json
```

Approving a submission writes or updates the published manifest for that package ID.

## Submission Record Shape

Submission records contain:
- queue metadata: `submissionId`, `status`, `createdAt`, `updatedAt`
- public package data under `package`
- private contact data under `contact`
- review metadata under `review`
- optional publish metadata once approved

This keeps the public package shape separate from the private follow-up data.

## Review Workflow

There is no in-app admin surface for the MVP.

Review is done locally on the catalog host with private CLI commands:

Windows PowerShell examples:

```powershell
.\scripts\review-submissions.ps1 list pending
.\scripts\review-submissions.ps1 show sub_xxxxx
.\scripts\review-submissions.ps1 approve sub_xxxxx --reviewer Flyer --notes "Validated manually"
.\scripts\review-submissions.ps1 reject sub_xxxxx --reviewer Flyer --notes "Broken script"
.\scripts\review-submissions.ps1 needs-changes sub_xxxxx --reviewer Flyer --notes "Update version and fix docs"
```

Linux examples:

```bash
./scripts/review-submissions.sh list pending
./scripts/review-submissions.sh show sub_xxxxx
./scripts/review-submissions.sh approve sub_xxxxx --reviewer Flyer --notes "Validated manually"
./scripts/review-submissions.sh reject sub_xxxxx --reviewer Flyer --notes "Broken script"
./scripts/review-submissions.sh needs-changes sub_xxxxx --reviewer Flyer --notes "Update version and fix docs"
```

## Approval Behavior

Approving a submission performs these steps:

1. Load the pending submission.
2. Build the public package manifest.
3. Compute a deterministic package hash from the public manifest contents.
4. Write or update `apps/catalog/data/packages/<packageId>.json`.
5. Move the submission record into `approved` with reviewer and publish metadata.

Rejecting or marking a submission as needing changes moves the record into the matching review directory and stores reviewer notes.

## HTTP Surface

Public pages:
- `GET /`
- `GET /submit`

Public API:
- `GET /api/v1/packages`
- `GET /api/v1/packages/:id`
- `POST /api/v1/telemetry/install-success`
- `POST /api/v1/submissions`

The submission endpoint only accepts new submissions. It does not expose review state or queue contents.

## Validation Rules

- `packageId` must be a lowercase URL-safe slug.
- `version` must be semver-like.
- `authorProfileUrl` must point to `https://play.aidungeon.com/profile/<handle>`.
- `description` must be non-empty and may contain Markdown links.
- `discordUsername` must be non-empty.
- All four script fields must be present as strings, though they may be empty.

## Out Of Scope For This MVP

- public package detail pages
- uploader authentication
- reviewer authentication in the web app
- direct uploader edit/resubmit flows
- file upload handling for thumbnails
- automated malware or policy scanning
- email or Discord notifications
