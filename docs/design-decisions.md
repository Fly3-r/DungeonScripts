# Design Decisions

This file records product, architecture, and UX decisions for DungeonScripts.

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

### Represent public authors as AI Dungeon profile links

Decision:
Published packages store both a public author display handle and an `authorProfileUrl`, with the catalog rendering the author as a clickable AI Dungeon profile link.

Reason:
The author identity needs to map back to AI Dungeon rather than a freeform label, and the profile link is the cleanest public representation for that requirement.

### Treat package descriptions as long-form Markdown source

Decision:
Package descriptions are stored as long-form Markdown-capable text, with the homepage using a shortened preview while the full description remains in the published manifest for future detail pages.

Reason:
Package authors need enough space to include setup notes and links, but the catalog homepage should stay compact and scannable.

### Replace browser-managed package approval with repo-driven package sources

Decision:
Package authorship and review now happen through the Git workflow for `apps/catalog/data/scripts/<package-id>`, not through browser-managed package approval pages inside the catalog app.

Reason:
The browser-based workflow added authentication, queue-state, and moderation complexity that was not necessary for the actual operating model. Keeping package source-of-truth in the repo is simpler and easier to audit.

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

### Remove the dormant submission queue artifacts after the repo-driven model stabilized

Decision:
The unused `apps/catalog/data/submissions` directory and the remaining submission/admin-specific notes were removed once the repo-driven package model became the only supported workflow.

Reason:
Dormant queue artifacts and dead workflow notes were making the active package source path less obvious than it needed to be.

### Tighten the catalog homepage copy around the DungeonScripts brand

Decision:
The catalog homepage should use the `DungeonScripts` product name in the hero and simplify the surrounding copy to focus on one-click installation.

Reason:
The earlier wording described implementation details instead of the product. Shorter, branded copy is clearer and reads more like a real catalog front page.

### Add an attribution footer to the catalog homepage

Decision:
The homepage should end with a small footer that links to the project GitHub placeholder and credits inspiration from MCA by LewdLeah.

Reason:
The footer gives the page a cleaner finished edge and makes project attribution visible without interrupting the install flow.

### Offer a direct install-extension CTA when the bridge is missing

Decision:
The catalog bridge panel should show an Install Extension button linking to the DungeonScripts GitHub repository only when the browser extension is not detected.

Reason:
When the bridge check fails, the page should immediately show the next useful action instead of leaving the user with only a refresh button and an error message.

### Point the homepage footer at the real DungeonScripts repository

Decision:
The homepage footer link should be labeled DungeonScripts GitHub and point directly to https://github.com/Fly3-r/DungeonScripts.

Reason:
The footer should take users to the actual project repository rather than a placeholder destination.

### Make install preview compare against every install target, not just the current branch

Decision:
The preview modal should compare the selected package against the root scenario and every playable leaf, matching the same target set the installer will overwrite.

Reason:
A pre-install preview is only trustworthy if it reflects the full scope of the actual write operation.

### Keep the preview path read-only and render diffs in a catalog modal

Decision:
Preview requests fetch the current script state through the extension, compare it to the selected package, and render the diff in a modal on the catalog page without creating restore points or mutating AI Dungeon.

Reason:
Preview should be safe to run repeatedly and should not create backup noise or change scenario state before the user confirms installation.

### Let repo-driven package sources accommodate large real-world script libraries

Decision:
The catalog builder now allows much larger source script files by default and reads the limit from MAX_SOURCE_SCRIPT_LENGTH, defaulting to 1,000,000 characters per script file.

Reason:
Real AI Dungeon packages such as Inner Self exceed the earlier 200,000-character cap. The repo-driven model should accept legitimate large script libraries instead of rejecting them at catalog startup.

### Give the repo-driven catalog enough headroom for very large script libraries

Decision:
The default MAX_SOURCE_SCRIPT_LENGTH is raised to 5,000,000 characters per script file while remaining overrideable by environment variable.

Reason:
localized-languages is roughly 1.96 million characters in Library.js, so the previous 1,000,000-character default still rejected a legitimate package. A higher default avoids repeated policy churn while keeping the limit explicit and configurable.

### Treat the install-extension button as a static fallback, not a bridge-state indicator

Decision:
The catalog page now shows the Install Extension link by default, and the extension bridge hides it immediately whenever the extension is present on the page.

Reason:
The button should remain visible only when the extension is truly absent. Tying it to runtime status made it reappear even when the extension was detected but waiting on AI Dungeon state.

### Force the HTML hidden attribute to win over styled buttons

Decision:
The catalog stylesheet now includes a global [hidden] { display: none !important; } rule.

Reason:
Styled buttons use explicit display values, which override the browser's default hidden behavior unless the page stylesheet restores it explicitly.

### Persist telemetry events before delivery so success stats survive worker restarts

Decision:
Anonymous install-success events are now written to chrome.storage.local before the extension attempts to POST them to the catalog API.

Reason:
A service-worker restart or transient network failure should not be able to silently drop the one anonymous install stat after the install has already completed successfully.

### Retry queued telemetry with bounded backoff on startup and future installs

Decision:
The extension now flushes queued telemetry on startup, on extension install/update startup hooks, after catalog-origin changes, and after each new successful install, using a bounded retry backoff for failed sends.

Reason:
This keeps telemetry delivery automatic and durable without making analytics failure part of the install critical path.

### Add an explicit telemetry failure-injection mode for regression testing

Decision:
The extension now exposes a background-only telemetry test mode that can force the next telemetry delivery attempt, or every telemetry delivery attempt, to fail without touching the catalog server.

Reason:
The retry queue needs a deterministic failure path for automation. Injecting failure in the extension keeps the test local, repeatable, and separate from normal runtime behavior.

### Let explicit telemetry flushes bypass retry backoff while keeping automatic retries bounded

Decision:
Background startup/install retries still respect nextAttemptAt, but the explicit telemetry flush message used by diagnostics and regression testing now forces an immediate delivery attempt.

Reason:
The retry schedule should protect normal runtime traffic, while an explicit flush action is only useful if it can drain the queue immediately after a forced failure.

### Replace browser confirm with an in-page install selection modal

Decision:
The catalog page now confirms installs through its own modal instead of using the browser's `window.confirm` prompt.

Reason:
The browser dialog could only show a flat summary string. The catalog needs a richer confirmation surface so users can review the target scope and control where the package will be applied.

### Default install selection to all discovered targets while allowing per-target opt-out

Decision:
When the install modal opens, the root scenario and every playable leaf are preselected, but the user can uncheck any target before confirming the install.

Reason:
The default path should still match the safest whole-scenario install behavior, while advanced users need a way to keep different scripts on different leaves without editing the package itself.

### Scope install writes, restore points, and summaries to the selected targets

Decision:
Install execution, restore-point capture, and install-summary leaf counts now operate on the exact target list selected in the install modal.

Reason:
Once install scope becomes user-selectable, the backup and reporting paths must stay aligned with the actual write set or rollback and status text become misleading.

### Shorten the primary catalog install action to Install

Decision:
The main package action on the catalog cards should be labeled `Install` instead of `One-Click Install`.

Reason:
The surrounding page already makes the one-click behavior clear. The shorter label is easier to scan and keeps the primary action button cleaner.


### Use repo-relative links and DungeonScripts branding in project documentation

Decision:
Project documentation should use repo-relative links instead of machine-specific absolute paths, and the published project name should be `DungeonScripts` throughout the docs and user-visible metadata.

Reason:
Absolute machine-specific links only work on one local layout. Repo-relative links travel cleanly across local drives and clones, and the docs should match the published repository branding.


### Keep rollback scoped to the latest restore point only

Decision:
DungeonScripts will support rollback of the latest restore point only and will not add restore-point browsing as part of the intended product scope.

Reason:
The current rollback behavior already covers the main safety requirement without adding history-management UI and storage complexity that the project does not need.

### Default the extension catalog origin to the production DungeonScripts domain

Decision:
The extension now defaults its catalog origin to `https://dungeonscripts.com` while keeping localhost origins built in for fast manual development switching.

Reason:
Production should be the out-of-the-box destination for normal users, but local development still needs to remain one field change away in the popup.

### Publish the privacy policy from the catalog site under /docs/privacy-policy.md

Decision:
The public site footer should link to `/docs/privacy-policy.md`, with the catalog server exposing the repository privacy-policy document at that exact public path.

Reason:
The privacy policy needs to be reachable from the live website, not only from the repository tree, and the footer is the right place for that legal disclosure link.

### Distinguish local extension processing from transmitted telemetry in the privacy policy

Decision:
The privacy policy should separate data the extension processes locally in the browser from the only data intentionally sent to DungeonScripts infrastructure: the anonymous install-success event.

Reason:
That wording is more accurate for a privacy-focused extension and makes it clear that AI Dungeon auth and scenario contents are used locally for functionality rather than collected as service analytics.

### Enforce canonical package source filename casing

Decision:
Package source folders should use the documented canonical filenames such as Library.js, Input.js, Context.js, Output.js, and Thumbnail.png.

Reason:
Linux hosts are case-sensitive, so relying on lowercase variants works on Windows by accident but breaks the catalog builder in production.
