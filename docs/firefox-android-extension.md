# Firefox Android Extension

DungeonScripts now has a dedicated Firefox Android development target alongside the desktop Firefox build.

## Build The Android Target

From the repo root:

```powershell
npm run extension:build:firefox-android
```

This creates an Android-ready unpacked build at [apps/extension/dist/firefox-android](../apps/extension/dist/firefox-android).
Packaged browser artifacts can be refreshed into the repo-root `dist/` folder with:

```powershell
npm run extension:sync:artifacts
```

That writes `dist/Firefox-Mobile-<extension-version>.xpi`.

## Lint For Firefox Android

Before loading the extension, run:

```powershell
npm run extension:lint:firefox-android
```

This rebuilds the Android target and runs `web-ext lint` against it so Android-specific manifest and API issues show up early.

## Temporarily Load It On Android

Prerequisites:
- Android Studio SDK Platform Tools installed
- `adb devices` shows your emulator or device
- Firefox for Android installed on the emulator or device
- `Remote debugging via USB` enabled in Firefox for Android
- at least one browser tab open in Firefox for Android

From the repo root:

```powershell
npm run extension:run:firefox-android
```

The run script:
- rebuilds the `firefox-android` target
- auto-detects a single connected Android device when possible
- defaults to Firefox Nightly with `org.mozilla.fenix`
- temporarily loads the extension through `web-ext`

Override the defaults when needed:

```powershell
$env:ANDROID_DEVICE = "emulator-5554"
$env:FIREFOX_ANDROID_APK = "org.mozilla.firefox"
npm run extension:run:firefox-android
```

You can also pass additional `web-ext` arguments after `--`:

```powershell
npm run extension:run:firefox-android -- --verbose
```

## Debugging

1. Connect the emulator or device with `adb`.
2. Open desktop Firefox and go to `about:debugging`.
3. Enable USB device discovery and connect to the Android device.
4. Start the extension with `npm run extension:run:firefox-android`.
5. Open `Inspect` on the main process to view console output and debug extension scripts.

If the add-on fails to load, inspect manifest/runtime messages with:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" logcat | findstr addon@dungeonscripts.com
```

## Current Notes

- The Android target uses the same shared extension runtime as Chrome and desktop Firefox.
- The Android workflow is currently aimed at temporary development loading through `web-ext`.
- Firefox Nightly crashes or emulator restarts will drop the temporary add-on, so rerun the load command after restarting the browser or emulator.
