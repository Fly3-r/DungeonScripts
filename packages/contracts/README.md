# Contracts

Shared payload definitions for the AID One-Click scaffold.

Current contracts:
- `package-manifest.schema.json`
- `install-success.schema.json`

These schemas are intentionally narrow:
- package manifests describe script payloads fetched by the extension
- manifests now include `thumbnailUrl` so the public catalog can render cards without a separate asset registry
- install-success telemetry allows only the single anonymous success event
