# Design Decisions

This file records product, architecture, and UX decisions for AID-OneClick.

## 2026-03-19

### Separate website/API from the Chrome extension

Decision:
The Chrome extension is the client. The script catalog and telemetry endpoint live in a separately hosted external website/API.

Reason:
This keeps catalog delivery, telemetry handling, and hosting concerns separate from the browser extension package. It also allows self-hosting via Docker without coupling hosting logic to Chrome.

### Use root as the control point, and install to the root plus playable leaves

Decision:
The extension UI treats the root scenario as the control point, and actual script installation targets the root scenario plus every playable leaf branch.

Reason:
The MCA findings indicate branches are self-contained and child branches do not inherit scripts from parents. Writing the root keeps the scenario entry point aligned with the installed package, while leaf writes preserve behavior for playable branches.

### Backup and rollback are first-class MVP requirements

Decision:
Every install must create a restore point before any leaf writes begin, and rollback must restore the prior state per leaf.

Reason:
Script installs are destructive overwrites. Safety and trust depend on restore capability, not just install success.

### Keep telemetry to one anonymous success event

Decision:
The MVP collects exactly one stat: completed successful installs.

Reason:
This satisfies the current reporting goal while minimizing privacy risk, implementation complexity, and policy surface area.

### Telemetry payload must exclude user and scenario identifiers

Decision:
The install-success event must not include user identity, scenario identity, script contents, tokens, or device tracking identifiers.

Reason:
The telemetry goal is counting installs, not identifying people or content. Data minimization is required by design, not as a later cleanup task.

### Start with a monorepo scaffold

Decision:
The repo uses a root workspace with `apps/extension`, `apps/catalog`, and `packages/contracts`.

Reason:
This keeps the client, external service, and shared payload definitions coordinated while remaining small enough for an MVP.

### Store extracted AI Dungeon auth tokens in session-only extension storage

Decision:
The extension stores extracted AI Dungeon auth tokens in `chrome.storage.session` and only exposes sanitized auth status to the popup UI.

Reason:
The install engine needs token access across service-worker wake cycles, but the token should not be written to long-lived local storage or surfaced in UI payloads.

### Validate access with read-only scenario discovery before enabling writes

Decision:
The first authenticated AI Dungeon integration step after token extraction is a read-only scenario discovery pass that resolves the current root title and playable leaf count.

Reason:
This proves the token and editor root are usable against the live GraphQL API before introducing destructive install operations.

### Persist restore points locally with per-leaf script snapshots

Decision:
Before any install writes occur, the extension snapshots each target leaf's `scriptsEnabled` state and all four script fields into `chrome.storage.local`.

Reason:
Rollback must be able to restore the exact pre-install state even if the popup closes or the service worker sleeps after the restore point is created.

### Attempt automatic rollback if an install fails after snapshot creation

Decision:
If install execution fails after the restore point has been created, the extension immediately attempts to restore the saved pre-install state.

Reason:
A failed partial rollout is worse than a visible failure. Automatic rollback reduces the chance that a user is left with half-installed script state across leaves.

### Keep install-success telemetry best-effort and non-blocking

Decision:
The extension posts the single anonymous install-success event after a completed install, but telemetry delivery must never fail the user install path.

Reason:
The install transaction is the product's primary responsibility. Analytics must stay subordinate to user safety and reliability, especially while retry persistence is still a later milestone.

### Use repo-root Docker Compose as the default catalog deployment entrypoint

Decision:
The external catalog/API should be started primarily through a repo-root `docker-compose.yml`, while preserving direct Node execution as a fallback development path.

Reason:
Compose gives the project one consistent self-hosting command, keeps runtime persistence explicit, and leaves room for additional services without replacing the operational entrypoint later.

### Serve the human catalog on `/` and version the JSON API under `/api/v1/*`

Decision:
The browsable catalog homepage lives at `/`, while machine-readable catalog and telemetry endpoints live under `/api/v1/*`.

Reason:
This cleanly separates user-facing pages from client-facing integrations, and it gives the API room to evolve without restructuring the public website later.

### Compute install counters server-side instead of storing them in package manifests

Decision:
Package manifests remain the source of static package metadata, while install counters are derived from telemetry data on the server and attached to API responses.

Reason:
Install counts are dynamic operational data. Keeping them out of the manifests avoids noisy content churn and preserves a clean boundary between package definitions and runtime analytics.

### Let the catalog page show the current extension target before install

Decision:
When the extension is present on the catalog site, it should surface the current scenario root, title, and playable leaf count directly on the page before the user confirms an install.

Reason:
The install site should make the target explicit. Showing the current scenario context reduces uncertainty and makes one-click install trustworthy enough to use from an external catalog page.

### Attach the catalog-site bridge to already-open tabs, not just future loads

Decision:
The catalog-site bridge must be registered for future page loads and also injected into already-open catalog tabs whenever the extension starts or the catalog origin changes.

Reason:
Users should not need a full browser restart or guess that a reload is required before the site recognizes the extension. The bridge needs to become active as soon as the extension is ready.

### Expose rollback from the catalog page only on the matching package card

Decision:
The catalog page should show a `Rollback Latest` button beside `One-Click Install`, but only enable it on the card whose package matches the extension's latest restore point.

Reason:
Rollback is global to the latest saved restore point, not to every catalog item. Matching the active button to the restore point keeps the page understandable and reduces the chance of restoring the wrong package by mistake.

### Hide the catalog rollback control until a matching restore point exists

Decision:
The catalog page should keep the rollback button hidden until the extension reports a latest restore point for that package.

Reason:
A disabled rollback button adds noise before the user has installed anything. Hiding it until it becomes relevant keeps the card simpler while still surfacing rollback immediately after install activity begins.


### Allow package manifests to omit thumbnails when a fallback image is available

Decision:
Source package manifests may omit `thumbnailUrl`, and the catalog service will substitute a bundled placeholder image in API responses.

Reason:
Thumbnail artwork should improve package browsing, but it should not be a hard publishing requirement. Applying the fallback at the API boundary keeps both the website and extension responses consistent.

### Keep a real-browser regression harness for install and rollback

Decision:
The project should maintain a Chrome DevTools Protocol regression harness that exercises the live catalog-to-extension install and rollback path, including full AI Dungeon page reloads before verification.

Reason:
This feature depends on real browser state, extension messaging, and AI Dungeon persistence behavior. A repeatable live-browser harness is the most reliable way to catch regressions in the one-click workflow as new features are added.

### Start the regression harness with stable root-scenario verification and expand outward

Decision:
The first committed live-browser regression harness verifies the active root scenario end to end and records discovered leaf targets, while branch-by-branch navigation remains a later extension of the harness.

Reason:
Root verification is stable and repeatable with the current DevTools hooks. Branch switching in the AI Dungeon editor needs additional product-specific automation before it can be treated as reliable regression coverage.



### Give the catalog site a dark theme with purple accents

Decision:
The public catalog page should use a dark visual theme with purple-led accents while preserving the existing information architecture and card layout.

Reason:
The catalog is a browsing surface for scripts rather than a neutral admin screen. A darker, more atmospheric presentation better fits the product direction and makes the extension-bridge state feel more intentional without changing the underlying flow.

