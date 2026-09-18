#!/usr/bin/env bash
# Typechecks and tests every workspace. Needs no AWS credentials and makes
# no network calls beyond the dependency install.
set -euo pipefail
cd "$(dirname "$0")/.."

scripts/lib/ensure-deps.sh
npm run typecheck --workspaces --if-present
npm test --workspaces --if-present
