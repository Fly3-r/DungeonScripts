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
