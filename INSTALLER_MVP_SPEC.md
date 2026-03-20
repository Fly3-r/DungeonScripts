# DungeonScripts MVP Spec

## Scope

This MVP is a Chrome extension plus a separately hosted script catalog/API.

The extension:
- detects an AI Dungeon scenario editor page
- installs a selected script package to all playable leaf branches
- creates a backup before any writes
- supports rollback to the pre-install state
- emits one minimal anonymous telemetry event only after a fully successful install

The catalog website/API:
- lists script packages
- exposes package metadata and script payloads for the extension
- accepts one privacy-focused install-success event

The website/API is external to the Chrome extension. It is not the same thing as the extension UI.

## Architecture Split

### Chrome extension

Runs in the user's browser.

Responsibilities:
- detect the active AI Dungeon editor page
- enumerate target leaf branches
- create restore points
- install scripts to leaf branches
- perform rollback
- fetch package data from the external catalog/API
- send the single anonymous install-success event

### External website/API

Runs outside the browser extension as a normal web service.

Responsibilities:
- render catalog pages for humans to browse
- serve package manifests and script payloads for the extension
- accept the single anonymous install-success event

The extension may open this website in a browser tab, fetch data from it in the background, or both.

## Deployment Model

### Recommended MVP deployment

Use a separately hosted web app/API for the catalog side.

Recommended shape:
- one small web application
- one small API surface
- one deployable Docker container for self-hosting

This means the extension remains a client, while the website/API can be deployed independently to any server, VPS, or container host.

### Docker-friendly layout

A simple MVP can be packaged as one container that does all of the following:
- serves catalog pages
- serves package JSON
- serves script payloads
- exposes `POST /api/telemetry/install-success`

Alternative deployment is also acceptable:
- static frontend for catalog pages
- separate lightweight API for telemetry and package manifests

### Important distinction

The Chrome extension UI is not the hosted website.

The extension is installed in Chrome.
The website/API is a normal externally hosted service.
Docker would apply to the website/API side, not to the extension itself.

## Core Behavior

### Install model

The root scenario is the control point in the extension UI, but installation writes to playable leaf branches.

This matches the MCA findings:
- leaves are the playable branches
- child branches do not inherit scripts from parents
- scripts must be written per leaf branch

### Script write flow per leaf

Each target leaf uses this two-step write path:

1. `updateScenario({ shortId, scriptsEnabled: true })`
2. `updateScenarioScripts({ shortId, gameCode })`

`gameCode` contains:
- `sharedLibrary`
- `onInput`
- `onModelContext`
- `onOutput`

## Backup And Rollback

### Required guarantee

No install starts until a full restore point is created for every target leaf.

### Restore point contents

For each target leaf store:
- `shortId`
- `scriptsEnabled`
- `sharedLibrary`
- `onInput`
- `onModelContext`
- `onOutput`

Top-level restore point metadata:
- `restorePointId`
- `createdAt`
- `origin`
- `rootShortId`
- `packageId`
- `packageVersion`
- `leafCount`

### Storage

Store restore points in `chrome.storage.local`.

Optional:
- allow manual export of restore point JSON

### Rollback behavior

Rollback restores the exact prior state for each leaf:

1. restore `scriptsEnabled`
2. restore all 4 script fields

Rollback must work even if telemetry submission fails.

### Partial failure handling

If install fails on any leaf:
- report install as failed
- do not emit the telemetry event
- keep the restore point
- offer immediate rollback

## Telemetry

### Goal

Collect exactly one stat:
- successful completed installs

### Event rule

Emit telemetry only when the install completes successfully across all required target leaves.

Do not emit telemetry for:
- attempted installs
- partially successful installs
- failed installs
- rollbacks

### Privacy rules

Telemetry must not include:
- Firebase token
- AI Dungeon username
- email
- IP address in application logs if avoidable
- scenario title
- scenario description
- scenario content
- script contents
- branch short IDs
- root short ID
- browser fingerprint data
- precise timestamps beyond normal event time

### Minimal event payload

```json
{
  "event": "script_install_succeeded",
  "installId": "uuid-v4",
  "packageId": "example-package",
  "packageVersion": "1.0.0",
  "leafCount": 22,
  "timestamp": "2026-03-18T14:20:00Z"
}
```

### Anonymous design choices

- `installId` exists only for retry de-duplication
- no persistent user ID
- no device ID
- no account ID
- no scenario ID
- no session replay
- no analytics SDK

### Transmission rules

- send from the extension background worker
- send after install success is confirmed
- telemetry failure must never change install outcome
- if the POST fails, queue the event locally and retry later
- retries must use the same `installId`

### Queue rules

Queued telemetry in `chrome.storage.local` should contain only the same minimal payload.

Retry policy:
- on extension startup
- when the user opens the extension
- after the next successful install

No aggressive retry loop is needed for MVP.

## Server-Side Privacy Requirements

The external website/API endpoint should be designed for data minimization.

### Endpoint

`POST /api/telemetry/install-success`

### Accepted payload

Only accept:
- `event`
- `installId`
- `packageId`
- `packageVersion`
- `leafCount`
- `timestamp`

Reject extra fields.

### Storage rules

Store only what is needed for counting installs by package and version.

Recommended retained fields:
- `installId`
- `packageId`
- `packageVersion`
- `leafCount`
- `timestamp`

Recommended server practices:
- de-duplicate by `installId`
- avoid storing raw request bodies beyond normal operational needs
- avoid storing IP addresses in app-level analytics tables
- keep web server access logs short-lived if possible
- do not enrich events with browser fingerprinting

## Package Format

Each hosted package should expose:
- `id`
- `name`
- `version`
- `description`
- `author`
- `sharedLibrary`
- `onInput`
- `onModelContext`
- `onOutput`
- `minInstallerVersion`
- `hash`

## Install UX

### Preflight

Before install, show:
- package name and version
- number of leaf branches targeted
- warning that existing scripts on those leaves will be overwritten
- confirmation that a backup will be created first

### Success

On success, show:
- package name and version
- number of updated leaves
- restore point created

### Failure

On failure, show:
- how many leaves succeeded
- how many failed
- restore point available
- rollback action

## Non-Goals For MVP

- per-user analytics
- daily active users
- account linking
- package recommendation ranking
- cross-device tracking
- branch-level selective install
- rollback telemetry

## Implementation Order

1. Leaf discovery
2. Restore point creation
3. Install transaction
4. Rollback flow
5. Catalog fetch
6. Minimal success telemetry

