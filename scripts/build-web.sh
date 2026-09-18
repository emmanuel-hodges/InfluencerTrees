#!/usr/bin/env bash
# Builds the site into dist/web, stamped with the commit. Needs no AWS
# credentials. Environment-specific values are not baked in: the site talks
# to /api on whichever hostname serves it.
set -euo pipefail
cd "$(dirname "$0")/.."

scripts/lib/ensure-deps.sh
commit="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

rm -rf dist/web
VITE_COMMIT="$commit" npm run build -w web
echo "$commit" > dist/web/version.txt

echo "built dist/web at $commit:"
find dist/web -type f | sort
