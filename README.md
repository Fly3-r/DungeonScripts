# DungeonScripts

DungeonScripts is a project focused on easy and safe installation of AI Dungeon scripts into scenarios, including support for multi-choice scenario trees with selectable root and leaf installs.

## Install the Extension

There are currently two installation paths:
- Chrome Web Store release: currently submitted and pending review
- Manual Chrome installation: download the packaged extension ZIP and load it unpacked in Chrome
- Manual Firefox desktop installation: build the Firefox package folder and load it temporarily in Firefox

### Manual Chrome Installation

Download the extension ZIP from:
- https://github.com/Fly3-r/DungeonScripts/blob/main/apps/extension-0.1.0.zip

Then install it in Chrome:
1. Download the extension ZIP file.
2. Extract the ZIP folder somewhere you'll remember.
3. Open Google Chrome and go to `chrome://extensions`.
4. Turn on Developer mode using the top-right toggle.
5. Click `Load unpacked`.
6. Select the extracted extension folder.

### Manual Firefox Desktop Installation

From the repo root:

```powershell
npm run extension:build:firefox
npm run extension:sync:firefox
```

Then install it in Firefox desktop:
1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on...`.
3. Select `apps/firefox-0.1.0.xpi` or the latest matching `apps/firefox-<version>.xpi`.

More Firefox notes live in [firefox-extension.md](docs/firefox-extension.md).

## Getting Started

1. Go to `https://play.aidungeon.com` and log in.
2. Be mindful of possible bugs. For extra safety, optionally duplicate your scenario first.
3. Edit any scenario. The URL should end with `/edit`.
4. Go to `https://dungeonscripts.com`.
5. Verify the extension bridge status on the page.
6. Use `Install` to apply the selected script.
7. Optionally use `Preview` first to inspect the script changes before installing.

## Troubleshooting

- After installing or reinstalling the extension, it may be necessary to reload the AI Dungeon scenario edit page.
- The current automated regression harness is still Chrome-based. Firefox desktop is supported through the shared runtime plus the Firefox-specific build manifest.
- Run `npm run hooks:install` once in a local clone to enable the pre-commit hook that refreshes `apps/firefox-<version>.xpi` before each local commit.

## For Script Makers

- Package sources follow the repo-driven model documented in [repo-package-model.md](docs/repo-package-model.md).
- Submit a pull request with your script package files.
- If you need help preparing a package, reach out to `fly3_r` on Discord.

## More Information

- Additional project information is available in [overview.md](docs/overview.md).
- Firefox desktop build notes live in [firefox-extension.md](docs/firefox-extension.md).
- More technical and project documentation lives throughout the [docs](docs) directory.
