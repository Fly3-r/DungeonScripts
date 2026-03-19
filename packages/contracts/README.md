# Contracts

Shared payload definitions for the AID One-Click scaffold.

Current contracts:
- `package-manifest.schema.json`
- `install-success.schema.json`

These schemas are intentionally narrow:
- package manifests describe script payloads fetched by the extension
- `thumbnailUrl` is optional in source manifests because the catalog API applies a bundled fallback thumbnail when one is omitted
- install-success telemetry allows only the single anonymous success event
