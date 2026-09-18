#!/usr/bin/env bash
# Installs every workspace's dependencies from the lock file, once. Skipped
# when node_modules is already newer than package-lock.json, so each build
# script can call this without paying for a reinstall.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ ! -f node_modules/.package-lock.json || package-lock.json -nt node_modules/.package-lock.json ]]; then
  npm ci --no-audit --no-fund
fi
