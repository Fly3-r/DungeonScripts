# Chrome Extension Permission Justifications

This document records the Chrome Web Store review justifications for the DungeonScripts extension.

## Single Purpose

DungeonScripts has one narrow purpose: it lets a user install, preview, and roll back AI Dungeon scenario scripts from the DungeonScripts catalog into the scenario currently open in the AI Dungeon editor.

All requested permissions support that single purpose only:
- detecting the active AI Dungeon edit page
- fetching catalog package data
- installing or previewing scripts for the current scenario targets
- storing restore points and extension settings so rollback remains available

## Storage Justification

The `storage` permission is used to save extension settings, the selected catalog origin, install state, restore points for rollback, and a durable anonymous telemetry queue. The extension also uses session storage for temporary AI Dungeon auth and scenario state so the install and rollback workflow can complete safely without repeated user setup.

## Tabs Justification

The `tabs` permission is used to query and open relevant tabs for the supported DungeonScripts catalog origins and AI Dungeon editor flow. This allows the extension to detect already-open catalog tabs, open the catalog from the popup, and keep the install bridge connected to the correct site.

## Scripting Justification

The `scripting` permission is used to register, unregister, and inject the catalog bridge content script into the supported DungeonScripts catalog origins, including tabs that are already open. This is required so the catalog website can communicate with the extension for preview, install, and rollback actions.

## Host Permission Justification

Host permissions are required for the AI Dungeon website and API hosts so the extension can detect the scenario edit page, read scenario state, and update scenario scripts through AI Dungeon's GraphQL API.

Host permissions are also required for `https://dungeonscripts.com/*` so the extension can fetch package manifests, inject the catalog bridge, and send anonymous install-success telemetry for the public DungeonScripts catalog.

Local development origins such as `http://127.0.0.1:3000/*` and `http://localhost:3000/*` are included so the same extension build can be tested against a local development catalog before release.

The extension is intentionally limited to the supported catalog origins `https://dungeonscripts.com`, `http://127.0.0.1:3000`, and `http://localhost:3000`. It does not request optional access to arbitrary websites.

## Remote Code Statement

DungeonScripts does not use remote code in the extension runtime.

All JavaScript shipped by the extension is packaged with the extension itself. The extension does not load remote `<script>` files, remote modules, remote Wasm, or execute downloaded code through `eval()` or `new Function()`.

The extension does fetch remote package metadata and script text from the configured catalog, but that material is treated as data and is not executed by the extension. It is sent to AI Dungeon as scenario script content through AI Dungeon's API.

