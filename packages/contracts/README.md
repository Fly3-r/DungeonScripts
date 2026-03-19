# Contracts

Shared payload definitions for the AID One-Click scaffold.

Current contracts:
- `package-manifest.schema.json`
- `package-submission.schema.json`
- `install-success.schema.json`

These schemas are intentionally narrow:
- package manifests describe script payloads fetched by the extension
- package manifests now include both `author` and `authorProfileUrl` so the catalog can render a clickable AI Dungeon profile link
- source manifests may omit `thumbnailUrl` because the catalog API applies a bundled fallback thumbnail when one is omitted
- submission records keep private contact details under `contact`, separate from the publishable package shape
- install-success telemetry allows only the single anonymous success event
