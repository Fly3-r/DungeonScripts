# AID-OneClick Agent Guide

This file captures repo-specific working expectations for coding agents operating in this repository.

## Scope

These instructions apply to the whole repository unless a deeper `AGENTS.md` overrides them for a subdirectory.

## Core Workflow

- Build context from the existing code before changing behavior.
- Prefer small, focused changes over broad speculative refactors.
- Make local Git commits after each completed change batch.
- Do not push remote branches or publish artifacts unless explicitly requested.

## Documentation Expectations

Update documentation as part of the same change when behavior or workflow materially changes.

- Update [docs/agent-decisions.md](docs/agent-decisions.md) for workflow, tooling, validation, or implementation-process decisions.
- Update [docs/design-decisions.md](docs/design-decisions.md) for product, UX, architecture, packaging, or browser-support decisions.
- Update [README.md](README.md) or the relevant docs page when user-facing setup or testing steps change.
- Do not leave significant Firefox desktop, Firefox Android, or catalog workflow changes undocumented.

## Verification Expectations

Run the verification path that matches the area you changed.

### Chrome install-flow changes

Run [scripts/test-install-regression.ps1](scripts/test-install-regression.ps1) when changes affect any of these areas:

- `apps/extension/src/background/`
- `apps/extension/src/content/`
- `apps/extension/src/catalog/`
- extension install, preview, rollback, restore-point, scenario-read, or bridge behavior

If the regression harness cannot be run, say so explicitly in the final response.

### Firefox desktop changes

When Firefox desktop behavior, manifest, or packaging changes:

- rebuild the Firefox desktop target
- if packaging changed, refresh the versioned Firefox artifacts
- state clearly whether live Firefox desktop validation was performed

### Firefox Android changes

When Firefox Android behavior, manifest, or tooling changes:

- rebuild the `firefox-android` target
- run the Android lint workflow
- run the Android temporary-load workflow when the environment supports it
- state clearly whether the change was only linted/built or also tested on an emulator/device

### Catalog-only UI changes

For catalog page changes that do not affect install logic:

- syntax-check touched scripts when practical
- verify the rendered behavior manually when possible

### Version bumps and release cuts

If either the catalog version or the extension version changes:

- run [scripts/test-install-regression.ps1](scripts/test-install-regression.ps1) before finalizing the change
- keep the normal target-specific checks as well, such as Firefox desktop rebuilds and Firefox Android lint/load steps when those surfaces are affected
- say explicitly in the final response whether the regression pass succeeded or why it was not run

## Versioning Expectations

- Automatically bump version numbers as part of any release-worthy change instead of leaving versioning as a separate manual cleanup step.
- Catalog versioning is independent from extension versioning.
- The catalog version lives in [apps/catalog/src/version.js](apps/catalog/src/version.js) and should be bumped only when the catalog site or catalog-served API/runtime behavior changes.
- The extension version must stay identical across [apps/extension/manifest.json](apps/extension/manifest.json), [apps/extension/manifest.firefox.json](apps/extension/manifest.firefox.json), and [apps/extension/manifest.firefox-android.json](apps/extension/manifest.firefox-android.json).
- When extension version changes, rebuild the browser targets and refresh the packaged artifacts in [dist](dist).
- When a change affects both the catalog and the extension, bump both version tracks in the same change batch.

## Current Build And Test Commands

- Chrome build: `npm run extension:build:chrome`
- Firefox desktop build: `npm run extension:build:firefox`
- Firefox desktop package sync: `npm run extension:sync:firefox`
- Firefox Android build: `npm run extension:build:firefox-android`
- Firefox Android lint: `npm run extension:lint:firefox-android`
- Firefox Android run: `npm run extension:run:firefox-android`
- Chrome regression harness: `powershell.exe -ExecutionPolicy Bypass -File .\scripts\test-install-regression.ps1`

## Final Response Expectations

- Summarize what changed in plain language.
- Mention the verification that was actually performed.
- Call out any important validation that was not run.
- Mention assumptions when they affected implementation choices.
