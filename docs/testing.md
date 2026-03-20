# Testing

This project now includes a repeatable Chrome DevTools Protocol regression harness for the live install, install-target selection, telemetry retry, and rollback flow.

## Current Coverage

The script [scripts/test-install-regression.ps1](../scripts/test-install-regression.ps1) validates:
- unpacked extension reload
- catalog page recognition of the extension
- AI Dungeon auth/session readiness
- preview modal opens successfully from the catalog page against the full discovered target set
- install triggered from the catalog page install modal with forced telemetry delivery failure injection
- default target selection in the install modal across the root and discovered playable leaves
- queued telemetry retention after the forced delivery failure
- successful telemetry queue flush and drain after recovery
- full AI Dungeon page reload after install
- full install-state verification against the generated package manifest for the root scenario and each discovered playable leaf
- rollback triggered from the catalog page
- full AI Dungeon page reload after rollback
- restore verification back to the pre-install snapshot for the root scenario and each discovered playable leaf

## Prerequisites

- Chrome must be running with remote debugging enabled on `127.0.0.1:9222`
- the unpacked extension must already be loaded
- a `chrome://extensions/` tab should already be open so the harness can reload the unpacked extension
- the catalog site must be running
- the catalog startup must have generated package manifests from `apps/catalog/data/scripts`
- an AI Dungeon edit page must already be open
- the catalog page must already be open

## Run It

From the repo root:

```powershell
npm run test:e2e:install
```

You can also run the PowerShell script directly and override inputs:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\test-install-regression.ps1 `
  -CatalogUrl "http://127.0.0.1:3000/" `
  -AidEditorUrl "https://play.aidungeon.com/scenario/xNJvqef4IPec/testing-oneclick/edit" `
  -PackageId "demo-script"
```

Optional parameters:
- `-ChromeDebugUrl`
- `-ExtensionId`
- `-PackageManifestPath`
- `-ReadyTimeoutSeconds`
- `-ActionTimeoutSeconds`
- `-ReloadSettleSeconds`
- `-SkipTelemetryRetryCheck`
- `-ReportPath`

## How To Extend It

When a new feature changes the live install flow, extend this harness instead of creating another one-off manual script.

Examples:
- new install scope behavior: add new snapshot assertions
- new target-selection behavior: add modal-selection assertions before confirming install
- new rollback behavior: add restore-state assertions
- new catalog UX gates: add page-state assertions before click
- new telemetry side effects: extend the injected failure/flush assertions or add network-state checks after install
- new branch-specific UI flows: keep verification target-based unless the feature truly depends on editor-side leaf navigation

The goal is to keep a single repeatable regression path for the real browser workflow.



