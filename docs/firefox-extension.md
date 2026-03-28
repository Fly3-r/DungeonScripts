# Firefox Extension

DungeonScripts now supports a Firefox desktop build alongside the existing Chrome build.

## Build the Firefox Package Folder

From the repo root:

```powershell
npm run extension:build:firefox
npm run extension:sync:firefox
```

This creates:
- a Firefox-ready unpacked build at [apps/extension/dist/firefox](../apps/extension/dist/firefox)
- a versioned release folder at `apps/firefox-<extension-version>`

## Load It In Firefox Desktop

1. Open `about:debugging#/runtime/this-firefox` in Firefox desktop.
2. Click `Load Temporary Add-on...`.
3. Select the manifest inside the versioned release folder, for example [apps/firefox-0.1.0/manifest.json](../apps/firefox-0.1.0/manifest.json).
4. Open an AI Dungeon scenario edit page, then open the DungeonScripts catalog.

The Firefox build keeps the same core behavior as Chrome:
- detect the active AI Dungeon edit page
- extract the AI Dungeon auth token
- discover the scenario root and playable leaves
- preview install diffs
- install to selected targets
- roll back the latest restore point

## Android Follow-Up

The repo is now structured so we can add a Firefox for Android target next without rewriting the extension runtime again.

Before we enable that build, we should first validate the Firefox desktop path end-to-end and then verify the remaining mobile-specific pieces:
- Firefox for Android distribution through Mozilla's add-on flow
- popup and tab UX on Android
- any Firefox Android API gaps that affect the current install flow

That keeps the Android work as a packaging and validation step instead of a full extension rewrite.

## Commit Automation

Run this once in your local clone to enable the tracked pre-commit hook:

```powershell
npm run hooks:install
```

After that, each local commit will automatically refresh the matching `apps/firefox-<version>` release folder before the commit completes.
