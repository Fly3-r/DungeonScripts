# Repo-Driven Package Model

This document defines the current catalog package workflow.

## Goals

- Keep package source-of-truth inside the Git repo.
- Remove browser-based package authoring and moderation state.
- Preserve the existing package API shape used by the extension.
- Regenerate public package manifests automatically when the catalog starts.

## Source Layout

Package source files live under:

```text
apps/catalog/data/scripts/
  <package-id>/
    metadata.json
    Library.js
    Input.js
    Context.js
    Output.js
    Thumbnail.png   # optional
```

Rules:
- `<package-id>` is the package ID and must use lowercase letters, numbers, and hyphens.
- `metadata.json` stores the publishable metadata.
- `Thumbnail.png` is optional. If it is missing, the catalog falls back to the bundled placeholder image.
- Source package folders are the only files reviewers should edit directly.

## metadata.json

`metadata.json` is intentionally small and should contain:
- `name`
- `version`
- `author`
- `authorProfileUrl`
- `discordUrl` (optional)
- `description`
- `minInstallerVersion` (optional)

Example:

```json
{
  "name": "Inner Self",
  "version": "1.0.0",
  "author": "Fly3_r",
  "authorProfileUrl": "https://play.aidungeon.com/profile/Fly3_r",
  "discordUrl": "https://discord.com/channels/123456789012345678/123456789012345679",
  "description": "Long-form description or install notes. Markdown links are allowed.",
  "minInstallerVersion": "1.0.0"
}
```

The implementation uses `name` rather than `title` so it lines up with the published package manifest contract.

## Build Behavior

When the catalog service starts, it:

1. scans `apps/catalog/data/scripts`
2. validates each package folder
3. reads `metadata.json` and the four script files
4. generates a public package manifest with a deterministic hash
5. writes the generated manifest to `apps/catalog/data/packages/<package-id>.json`

The public API continues serving the generated manifests, not the source folders directly.

## Review Model

There is no in-app uploader or admin review page in this model.

Review happens through the Git workflow for the repo itself:
- contributors propose package changes as normal project changes
- maintainers review the source package folders
- approved changes are merged into the repo
- restarting the catalog rebuilds the generated package manifests

## Runtime Surface

Public pages:
- `GET /`

Public API:
- `GET /api/v1/packages`
- `GET /api/v1/packages/:id`
- `GET /api/v1/packages/:id/thumbnail`
- `POST /api/v1/telemetry/install-success`

## Out Of Scope For This MVP

- browser-based package-authoring forms
- in-app approval or moderation
- package detail pages beyond the homepage cards
- automated malware or policy scanning
- hot-reload of package manifests without restarting the catalog
