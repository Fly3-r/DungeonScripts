# Package Sources

This directory is the source-of-truth for catalog packages.

Each package lives under its own folder:

```text
<package-id>/
  metadata.json
  Library.js
  Input.js
  Context.js
  Output.js
  Thumbnail.png   # optional
```

Notes:
- the folder name is the package ID
- package IDs must use lowercase letters, numbers, and hyphens
- `metadata.json` stores the public package metadata
- `Thumbnail.png` is optional; the catalog falls back to the bundled placeholder when it is missing
- the catalog rebuilds `../packages/*.json` from this source tree each time the service starts
