# Agent Decisions

This file records workflow, implementation-process, and agent-execution decisions for AID-OneClick.

## 2026-03-19

### Use separate files for design decisions and agent decisions

Decision:
Design decisions are logged in `docs/design-decisions.md`. Agent and workflow decisions are logged in this file.

Reason:
This keeps product reasoning separate from execution/process notes so the project history stays easier to scan.

### Treat `C:\github\AID-OneClick` as the source of truth

Decision:
All project work is now anchored to `C:\github\AID-OneClick`.

Reason:
That repo was designated as the primary workspace by the user. The older staging folder is only being used as a temporary bridge because of sandbox constraints in this session.

### Keep commits local only

Decision:
Commits may be created in the local Git repository after completed steps, but nothing should be pushed or published.

Reason:
This preserves checkpoint history without changing any remote state.

### Create a local Git commit after each completed implementation step

Decision:
After each discrete implementation step, create a local checkpoint commit in `C:\github\AID-OneClick`.

Reason:
This gives the repo a clean step-by-step history and makes rollback between milestones easier while keeping all changes local.

### Start with structural scaffolding before implementation details

Decision:
The initial buildout focuses on repo layout, extension shell, catalog/API shell, Docker support, and shared contracts before wiring AI Dungeon auth and install execution.

Reason:
That sequence creates stable project boundaries first, which reduces churn when implementing the real installer flow.

### Validate live read access before enabling destructive writes

Decision:
The first manual user validation target is auth extraction plus scenario-tree discovery, and only after that succeeds should the extension gain write-path controls.

Reason:
This keeps the first live AI Dungeon test low-risk and avoids combining token/debug issues with script mutation issues.

### Implement destructive install work in small safety-first increments

Decision:
The next milestone after authenticated reads is restore-point capture, latest-rollback support, and a single install flow before broader catalog or telemetry refinements.

Reason:
This delivers the minimum safe write path first, which is easier to validate against a live AI Dungeon scenario than a larger all-at-once build.

### Put container orchestration at the repo root

Decision:
The catalog container orchestration lives in the repo-root `docker-compose.yml`, with root-level npm scripts wrapping the compose commands.

Reason:
The root is the operational entrypoint for the whole workspace, and keeping orchestration there avoids a second startup convention once more services are added.

### Keep the public catalog usable without the extension and enhance it in place when the extension is present

Decision:
The catalog homepage should render and browse normally on its own, while the extension adds live scenario context and one-click install behavior when it is available on that origin.

Reason:
This avoids coupling the site to extension-only behavior while still delivering the richer workflow when the extension is installed.

### Keep the catalog-site bridge script dependency-free

Decision:
The catalog-site bridge content script should be self-contained instead of importing shared modules.

Reason:
The bridge is dynamically injected as a plain extension content script. Keeping it dependency-free avoids module-loading failures at injection time and makes the bridge more reliable.

### Avoid self-triggering observers in the catalog bridge

Decision:
The catalog-site bridge should rely on explicit refreshes and polling instead of observing the full document and mutating the same DOM subtree in the observer callback.

Reason:
A broad MutationObserver can end up retriggering itself while updating status text and button labels, which makes the catalog page unstable and can mask unrelated network behavior.

### Reuse the existing status payload for page-level rollback

Decision:
The catalog page rollback button should key off the existing `latestRestorePoint` field in the extension status response instead of adding a new bridge-specific API.

Reason:
The page already polls the extension for status. Reusing that payload keeps the bridge small, avoids extra background message types, and ensures the popup and catalog page reflect the same rollback state.

### Hide inactive rollback controls instead of showing placeholder disabled buttons

Decision:
The catalog bridge should toggle `hidden` on rollback buttons when no matching restore point exists, rather than leaving a disabled placeholder visible on every card.

Reason:
The extension already exposes enough status to know when rollback is relevant. Using visibility instead of a permanent disabled state reduces clutter without adding another render path.

### Normalize thumbnail fallbacks in the catalog service instead of only in the page client

Decision:
The catalog service should inject the fallback thumbnail URL into package list and manifest responses, while the page keeps a client-side image-error fallback as a second line of defense.

Reason:
Normalizing the thumbnail at the API boundary keeps the catalog website and extension clients in sync, and the extra browser-side fallback still protects against broken asset URLs.

### Reuse one deduped target set for snapshot, install, and rollback

Decision:
The extension should build a single deduped target list consisting of the root scenario plus playable leaves, and use that same list for restore-point capture, script writes, and rollback.

Reason:
Using one target set avoids root/leaf drift, prevents duplicate writes when the root is also a leaf, and keeps rollback coverage aligned with what the install actually changed.

### Stop content-script polling after the extension context is reloaded

Decision:
The AI Dungeon content script should treat `Extension context invalidated` as a normal shutdown signal, stop its timers and listeners, and suppress further background messaging attempts from the stale page context.

Reason:
Reloading the unpacked extension leaves old content-script instances behind in open tabs. If they keep polling, Chrome surfaces noisy uncaught promise errors even though the new extension context is already active.

### Wrap the catalog bridge in a function scope so reinjection is safe

Decision:
The catalog bridge file should execute inside an IIFE before checking its global bridge flag.

Reason:
The background worker reinjects the bridge into already-open catalog tabs. Without function scope, top-level `const` declarations throw redeclaration errors before the runtime guard can run.

### Treat Chrome DevTools automation as a maintained regression harness, not a one-off debug script

Decision:
The live install and rollback checks should be captured in a reusable PowerShell CDP script under `scripts/`, and future feature work that changes the browser flow should extend that harness and rerun it.

Reason:
Ad-hoc browser scripts are too easy to get out of sync with the current product behavior. Keeping one maintained harness makes regression testing repeatable and gives future feature work a single place to add coverage.

### Wait for fresh install-state transitions instead of trusting stale session storage

Decision:
The CDP regression harness should require a new install or rollback transition by checking `status` and a changed `updatedAt` value before treating an action as complete.

Reason:
The extension stores install state in `chrome.storage.session`, which can still contain a prior completed state. Transition checks prevent the test harness from falsely treating an old `ready` or `rolled_back` state as the result of the current action.

### Reload the full AI Dungeon page before verifying script persistence

Decision:
The regression harness should do a full `Page.reload` on the AI Dungeon editor and then verify server-backed script state after install and rollback.

Reason:
Observed behavior showed that AI Dungeon does not always surface updated script state immediately in the live editor session. Full page reloads make the verification path match how the user manually confirms persistence.

### Use the popup page as the stable runtime-message client for CDP automation

Decision:
The regression harness should send extension actions through the real popup-page runtime context instead of relying on synthetic web-page clicks or service-worker self-messaging.

Reason:
Synthetic catalog clicks were flaky under CDP, and the service worker could not reliably message itself through `chrome.runtime.sendMessage`. The popup page uses the same public message path as the real extension UI without depending on brittle DOM event simulation.

### Ship the first harness with root verification plus leaf discovery reporting

Decision:
The committed regression harness verifies the active root scenario after install and rollback, and it records the discovered leaf targets in the report for future branch-level automation.

Reason:
This gives the project a stable, rerunnable regression check now while leaving a clear upgrade path for explicit branch switching once the AI Dungeon leaf-navigation mechanics are fully scripted.

### Keep the dark-theme pass scoped to catalog styling only

Decision:
The dark purple theme update is limited to the catalog page stylesheet and the related decision logs, without changing page structure or browser-extension behavior.

Reason:
This is a presentation-only request. Keeping the write scope to the catalog styling avoids accidental regressions in the install workflow while still making the visual direction explicit in project history.

### Keep the typography change scoped to the catalog stylesheet

Decision:
The Roboto font change only updates the catalog page stylesheet and the decision logs.

Reason:
This request is presentation-only and does not require any structural or extension-side changes.

## 2026-03-20

### Collapse package review back into the repo workflow

Decision:
The temporary browser-managed package intake and review system was removed, and package review now happens through normal repo changes under `apps/catalog/data/scripts`.

Reason:
The repo is the real operating boundary for package changes. Removing the extra workflow keeps the codebase smaller and avoids maintaining a second review surface.

### Keep the startup build output as generated package manifests

Decision:
The server still serves `apps/catalog/data/packages/*.json`, but those files are now generated from the source package tree at startup instead of being edited directly.

Reason:
This preserves the existing package API and extension integration while making it clear which files are source and which files are generated output.

### Treat the package source folder as the canonical unit of review

Decision:
Each package now lives as a self-contained folder containing metadata, the four script files, and an optional thumbnail.

Reason:
A self-contained folder is easier to review in Git than one large generated manifest, and it matches how maintainers think about package ownership.

### Make the live regression harness resolve repo-relative inputs and use the generic extensions page

Decision:
The install regression harness now resolves `PackageManifestPath` relative to the repo root and targets `chrome://extensions/` instead of the more brittle `chrome://extensions/?errors=<extensionId>` URL.

Reason:
The previous assumptions broke as soon as the repo root changed or the Chrome extensions page was open on its normal URL. The harness should fail on real product regressions, not on caller working-directory or tab-URL trivia.

### Use the popup page as the extension test control surface when DevTools does not expose a worker target

Decision:
The install regression harness now treats the extension popup page as the extension control client for storage-backed state reads and action dispatch, instead of requiring a separately visible `service_worker` DevTools target.

Reason:
In the current Chrome remote-debugging session, the popup page is visible and fully capable of reading `chrome.storage.session` and sending runtime messages, while the extension worker target is not consistently exposed through `/json/list`.

### Prune the last submission/admin leftovers once the repo path is stable

Decision:
After the repo-driven package workflow was validated, the dead `apps/catalog/data/submissions` directory and the remaining superseded submission/admin log entries were removed.

Reason:
The project no longer benefits from keeping a second, inactive workflow visible in the tree. Pruning it makes the current package path and docs easier to follow.

### Keep the homepage polish pass scoped to copy, footer markup, and styling

Decision:
The DungeonScripts polish request updates only the catalog homepage text, the extension bridge summary string, the footer markup, and supporting CSS.

Reason:
This is a presentation pass. Keeping it scoped avoids accidental changes to package APIs or the install flow while still letting the page feel more finished.

### Keep the extension CTA polish limited to bridge-state UX

Decision:
The install-extension change adds a conditional GitHub CTA to the bridge header and updates the footer repository link without changing any package install or rollback behavior.

Reason:
This request is a small discovery and onboarding improvement. Keeping it isolated avoids coupling a simple page CTA to the extension runtime logic.

### Implement preview inside the existing catalog bridge instead of the site runtime

Decision:
The new Preview action is rendered by the catalog page, but the extension bridge owns the preview fetch, diff generation, and modal lifecycle because only the bridge can read the live AI Dungeon scenario state.

Reason:
Keeping preview in the bridge reuses the existing extension permission boundary and avoids leaking AI Dungeon state-fetch logic into the public website runtime.
