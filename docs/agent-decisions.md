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



