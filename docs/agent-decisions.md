# Agent Decisions

This file records workflow, implementation-process, and agent-execution decisions for AID-OneClick.

## 2026-03-19

### Use separate files for design decisions and agent decisions

Decision:
Design decisions are logged in `docs/design-decisions.md`. Agent and workflow decisions are logged in this file.

Reason:
This keeps product reasoning separate from execution/process notes so the project history stays easier to scan.

### Treat `C:\\github\\AID-OneClick` as the source of truth

Decision:
All project work is now anchored to `C:\\github\\AID-OneClick`.

Reason:
That repo was designated as the primary workspace by the user. The older staging folder is only being used as a temporary bridge because of sandbox constraints in this session.

### Keep commits local only

Decision:
Commits may be created in the local Git repository after completed steps, but nothing should be pushed or published.

Reason:
This preserves checkpoint history without changing any remote state.

### Start with structural scaffolding before implementation details

Decision:
The initial buildout focuses on repo layout, extension shell, catalog/API shell, Docker support, and shared contracts before wiring AI Dungeon auth and install execution.

Reason:
That sequence creates stable project boundaries first, which reduces churn when implementing the real installer flow.
