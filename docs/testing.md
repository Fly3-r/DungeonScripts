# Testing

This project now includes a repeatable Chrome DevTools Protocol regression harness for the live install and rollback flow.

## Current Coverage

The script [scripts/test-install-regression.ps1](/C:/github/AID-OneClick/scripts/test-install-regression.ps1) validates:
- unpacked extension reload
- catalog page recognition of the extension
- AI Dungeon auth/session readiness
- install triggered from the catalog page
- full AI Dungeon page reload after install
- active root-scenario script verification against the package manifest
- rollback triggered from the catalog page
- full AI Dungeon page reload after rollback
- restore verification back to the pre-install snapshot for the active root scenario
- discovery and reporting of the playable leaf targets for future branch-level automation

## Prerequisites

- Chrome must be running with remote debugging enabled on `127.0.0.1:9222`
- the unpacked extension must already be loaded
- the catalog site must be running
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
  -PackageId "demo-inner-self"
```

Optional parameters:
- `-ChromeDebugUrl`
- `-ExtensionId`
- `-PackageManifestPath`
- `-ReadyTimeoutSeconds`
- `-ActionTimeoutSeconds`
- `-ReloadSettleSeconds`
- `-ReportPath`

## How To Extend It

When a new feature changes the live install flow, extend this harness instead of creating another one-off manual script.

Examples:
- new install scope behavior: add new snapshot assertions
- new rollback behavior: add restore-state assertions
- new catalog UX gates: add page-state assertions before click
- new telemetry side effects: add service-worker storage or network-state checks after install
- branch-specific features: extend the harness from root verification to explicit leaf switching and leaf-state assertions

The goal is to keep a single repeatable regression path for the real browser workflow.
