# DungeonScripts

DungeonScripts is a project focused on easy and safe installation of AI Dungeon scripts into scenarios, including support for multi-choice scenario trees with selectable root and leaf installs.

## Installation

Preferred installation paths:
- Chrome Web Store (`Desktop only`): [DungeonScripts Chrome Extension](https://chromewebstore.google.com/detail/dungeonscripts/keookocbcbpgbiiakkgcdplohopfjibc)
- Firefox Add-ons (`Desktop and Mobile`): [DungeonScripts Firefox Addon](https://addons.mozilla.org/en-US/firefox/addon/dungeonscripts/)

Browser support:
- Chrome: Desktop only
- Firefox: Desktop and Mobile

If you need to install from packaged files instead of a browser store listing, see [Manual Extension Installation](#manual-extension-installation).

## Getting Started

1. Go to `https://play.aidungeon.com` and log in.
3. Edit any scenario. The URL should end with `/edit`.
4. Go to `https://dungeonscripts.com`.
5. Verify the extension bridge status on the page.
6. Use `Install` to apply the selected script.
7. Optionally use `Preview` first to inspect the script changes before installing.
8. Optionally for extra safety, optionally duplicate your scenario first.

## Troubleshooting

- After installing or reinstalling the extension, reload the AI Dungeon scenario edit page.
- If the extension bridge does not load correctly on `https://dungeonscripts.com`, click `Refresh Extension Status` in the `Extension Bridge` panel.
- If the bridge still does not attach, make sure you are logged in to AI Dungeon and have a scenario `/edit` page open in another tab.

## Script Makers

- Package sources follow the repo-driven model documented in [repo-package-model.md](docs/repo-package-model.md).
- Submit a pull request with your script package files.
- If you need help preparing a package, reach out to `fly3_r` on Discord.

## Manual Extension Installation

### Chrome Desktop

1. Download [Chrome-Desktop-1.0.0.zip](dist/Chrome-Desktop-1.0.0.zip) from [dist](dist).
2. Extract the ZIP somewhere you'll remember.
3. Open Google Chrome and go to `chrome://extensions`.
4. Turn on Developer mode using the top-right toggle.
5. Click `Load unpacked`.
6. Select the extracted folder.

### Firefox Desktop

1. Download [Firefox-Desktop-1.0.0.zip](dist/Firefox-Desktop-1.0.0.zip) from [dist](dist).
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on...`.
4. Select the downloaded ZIP file.
5. Open an AI Dungeon scenario edit page, then open `https://dungeonscripts.com`.

### Firefox Mobile

1. The packaged mobile artifact for this release is [Firefox-Mobile-1.0.0.xpi](dist/Firefox-Mobile-1.0.0.xpi) in [dist](dist).
2. Firefox for Android support is intended to ship through the Firefox add-on store once the listing is live.
3. Until that Firefox listing is available, mobile users should use the store release when published rather than expecting the same desktop-style local temporary add-on flow.

## Documentation

- Additional project information is available in [overview.md](docs/overview.md).
- Firefox desktop notes live in [firefox-extension.md](docs/firefox-extension.md).
- Firefox Android notes live in [firefox-android-extension.md](docs/firefox-android-extension.md).
- Regression and verification notes live in [testing.md](docs/testing.md).
- Catalog runtime and Docker deployment notes live in [apps/catalog/README.md](apps/catalog/README.md).
- More technical and project documentation lives throughout the [docs](docs) directory.
