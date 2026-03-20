# Contracts

Shared payload definitions for the AID One-Click scaffold.

Current contracts:
- `package-manifest.schema.json`
- `package-source-metadata.schema.json`
- `install-success.schema.json`

These schemas are intentionally narrow:
- package source metadata describes the repo-authored `metadata.json` file inside each package source folder
- package manifests describe script payloads fetched by the extension after catalog startup has generated them
- package manifests include both `author` and `authorProfileUrl` so the catalog can render a clickable AI Dungeon profile link
- source manifests may omit a thumbnail file because the catalog API applies a bundled fallback thumbnail when `Thumbnail.png` is absent
- install-success telemetry allows only the single anonymous success event
