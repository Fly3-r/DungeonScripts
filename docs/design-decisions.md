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

### Use Roboto for catalog-page typography

Decision:
The catalog page should use `Roboto` as its primary font family.

Reason:
The updated dark catalog styling benefits from a cleaner, more modern sans-serif treatment than the earlier serif type stack.

## 2026-03-20

### Use a public submission page with private host-local review (Superseded 2026-03-20)

Decision:
The first upload workflow used a public `/submit` page for intake while approval and moderation were handled only through local CLI tools on the catalog host. This was later replaced by the protected in-app `/admin` review page.

Reason:
This keeps the public product surface small, avoids in-app authentication work, and still supports a structured review process before anything is published.

### Keep uploader Discord usernames private to submission records only

Decision:
Submission records store `discordUsername` under a private contact section, and that field is excluded from the public package manifests and package APIs.

Reason:
Discord usernames are operational contact data, not catalog metadata. They are only needed for reviewer follow-up and should not leak into public responses.

### Represent public authors as AI Dungeon profile links

Decision:
Published packages store both a public author display handle and an `authorProfileUrl`, with the catalog rendering the author as a clickable AI Dungeon profile link.

Reason:
The author identity needs to map back to AI Dungeon rather than a freeform label, and the profile link is the cleanest public representation for that requirement.

### Treat package descriptions as long-form Markdown source

Decision:
Submission descriptions are stored as long-form Markdown-capable text, with the homepage using a shortened preview while the full description remains in the published manifest for future detail pages.

Reason:
Uploaders need enough space to include setup notes and links, but the catalog homepage should stay compact and scannable.

### Replace the host-local CLI review flow with an in-app admin page (Superseded 2026-03-20)

Decision:
Submission review now happens from a protected `/admin` page served by the catalog app itself, not from separate Windows and Linux CLI tools.

Reason:
The review workflow is part of the catalog product surface now. Keeping it inside the web app makes approval easier to operate and aligns better with the Docker-hosted deployment model.

### Use shared admin credentials for the review page (Superseded 2026-03-20)

Decision:
The catalog admin page is protected with shared admin credentials supplied through `CATALOG_ADMIN_USERNAME` and `CATALOG_ADMIN_PASSWORD`.

Reason:
This adds a practical approval gate without introducing a full user-account system. It keeps the approval workflow tied to the catalog service while staying small enough for the MVP.

### Persist submission and package data through Docker bind mounts (Superseded 2026-03-20)

Decision:
The Docker runtime must mount `apps/catalog/data/packages`, `apps/catalog/data/submissions`, and `apps/catalog/data/runtime` into the container.

Reason:
The admin page now publishes packages and updates the submission queue from inside the container. Those writes need to persist on the host across container restarts.



### Replace in-app submission and approval with repo-driven package sources

Decision:
Package authorship and review now happen through the Git workflow for `apps/catalog/data/scripts/<package-id>`, not through `/submit` and `/admin` pages inside the catalog app.

Reason:
The in-app workflow added authentication, queue-state, and moderation complexity that was not necessary for the actual operating model. Keeping package source-of-truth in the repo is simpler and easier to audit.

### Generate public package manifests from the repo source tree at catalog startup

Decision:
The catalog now rebuilds `apps/catalog/data/packages/*.json` from `apps/catalog/data/scripts/<package-id>` each time the service starts.

Reason:
This keeps the public package API stable for the extension while moving package authoring to a simpler file-based source layout.

### Keep thumbnails file-based inside each package source folder

Decision:
Each package source folder may include an optional `Thumbnail.png`, and the catalog serves it through a package-specific API route. Missing thumbnails fall back to the bundled placeholder image.

Reason:
Keeping thumbnails beside the script files and metadata makes each package self-contained without introducing extra asset-mapping metadata.
