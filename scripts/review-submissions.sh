#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run review-submissions.sh." >&2
  exit 1
fi

node "$SCRIPT_DIR/review-submissions.mjs" "$@"
