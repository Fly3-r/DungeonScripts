# Privacy Policy

Last updated: 2026-03-21

This Privacy Policy describes how DungeonScripts handles information in the Chrome extension and the DungeonScripts catalog website.

## Summary

DungeonScripts is designed to let users preview, install, and roll back AI Dungeon scenario scripts from the DungeonScripts catalog.

DungeonScripts is intentionally privacy-focused:
- it does not require account creation for the extension
- it does not sell personal information
- it does not use advertising or cross-site tracking inside the extension
- it sends only minimal anonymous install-success telemetry to the DungeonScripts catalog service

## Information Processed Locally by the Extension

Most extension activity happens locally in the user's browser so DungeonScripts can interact with the AI Dungeon editor. This local processing is used only to make preview, install, and rollback work.

### 1. AI Dungeon authentication and session state

To interact with the AI Dungeon scenario editor and API, the extension reads the AI Dungeon authentication token and current scenario context from the open AI Dungeon editor session.

This information is used only to:
- read the current scenario tree
- preview script differences
- install scripts to the selected scenario targets
- roll back the latest install

The extension stores authentication state in extension session storage so it is not intended to persist as long-term local data.

### 2. Scenario metadata and script content

When a user previews, installs, or rolls back a package, the extension reads scenario identifiers, scenario titles, script-enabled state, and the current script contents for the relevant scenario targets.

This information is used only to:
- show the active install target
- generate install previews and diffs
- create restore points for rollback
- write the selected package into AI Dungeon through AI Dungeon's API

Scenario script content and restore points are stored locally in the extension so rollback can work. DungeonScripts does not intentionally transmit a user's scenario script contents to the DungeonScripts catalog service.

### 3. Extension settings

The extension stores settings such as the selected catalog origin and install state in browser extension storage.

## Information Sent to DungeonScripts

DungeonScripts only intends to send one category of data from the extension to the configured catalog service:

### Anonymous install-success telemetry

After a successful install, the extension sends one minimal anonymous telemetry event to the configured catalog origin. That event currently contains:
- event type
- random install identifier
- package identifier
- package version
- target leaf count
- timestamp

This telemetry is used only to count successful package installs and operate the public install counter.

The telemetry event is not intended to include:
- name, email address, or account identity
- AI Dungeon authentication token
- scenario text or script contents
- payment information

Other extension activity, such as reading AI Dungeon authentication state, scenario titles, scenario identifiers, or scenario script contents, is intended to remain local to the browser except where needed to interact directly with AI Dungeon itself.

## Information Handled by the DungeonScripts Website

The DungeonScripts catalog website may receive:
- requests for catalog pages, package metadata, thumbnails, and telemetry endpoints
- standard server or reverse-proxy log information such as IP address, user agent, request path, and timestamp, depending on the hosting and proxy configuration used to operate the site

This information is used for normal website delivery, operational monitoring, abuse prevention, and troubleshooting.

## How Information Is Used

DungeonScripts uses information only to:
- operate the catalog website
- let users preview, install, and roll back AI Dungeon scripts
- maintain restore points locally for safety
- count successful installs in an anonymous, aggregate-friendly way
- troubleshoot operational issues and secure the service

## Sharing and Disclosure

DungeonScripts does not sell personal information.

DungeonScripts may share information only as needed to operate the service, such as:
- with AI Dungeon, when the extension reads or writes scenario state through AI Dungeon's website or API
- with hosting, reverse-proxy, CDN, or infrastructure providers used to operate the DungeonScripts website
- if required by law or legal process

## Data Retention

- Extension settings and restore points remain in browser extension storage until they are cleared by the user, overwritten by later extension activity, or removed as part of browser or extension cleanup.
- Session-scoped extension state is intended to be temporary.
- Anonymous install telemetry and normal server-side operational logs may be retained on the catalog infrastructure according to operational needs.

## User Choices

Users can:
- choose whether to install a package
- choose which scenario targets receive an install
- use rollback for the latest restore point
- change the configured catalog origin in the extension
- remove the extension or clear browser extension storage

## Security

DungeonScripts takes a minimization approach and aims to avoid collecting more data than needed for the install workflow. However, no system can guarantee absolute security.

## Third-Party Services

DungeonScripts interacts with:
- AI Dungeon website and API
- the configured DungeonScripts catalog origin
- infrastructure providers used to host or proxy the catalog service

Those services may have their own privacy policies and terms.

## Contact

For questions about this Privacy Policy or the DungeonScripts project, use the project repository:

https://github.com/Fly3-r/DungeonScripts



