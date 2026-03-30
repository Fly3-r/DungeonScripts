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
- a versioned Firefox temporary-load package at `apps/firefox-<extension-version>.zip`
- a matching Firefox distribution package at `apps/firefox-<extension-version>.xpi`

## Load It In Firefox Desktop

1. Open `about:debugging#/runtime/this-firefox` in Firefox desktop.
2. Click `Load Temporary Add-on...`.
3. Select the packaged Firefox add-on zip, for example `apps/firefox-0.1.0.zip`.
4. Open an AI Dungeon scenario edit page, then open the DungeonScripts catalog.

Use the `.zip` file for the local temporary add-on workflow.
Use the `.xpi` file for later signing or distribution workflows.

The Firefox build keeps the same core behavior as Chrome:
- detect the active AI Dungeon edit page
- extract the AI Dungeon auth token
- discover the scenario root and playable leaves
- preview install diffs
- install to selected targets
- roll back the latest restore point

## Firefox Android

Firefox Android now has its own development target and workflow.

See [firefox-android-extension.md](firefox-android-extension.md) for emulator setup, linting, temporary loading with `web-ext`, and remote debugging notes.

## Commit Automation

Run this once in your local clone to enable the tracked pre-commit hook:

```powershell
npm run hooks:install
```

After that, each local commit will automatically refresh the matching `apps/firefox-<version>.zip` and `apps/firefox-<version>.xpi` packages before the commit completes.
