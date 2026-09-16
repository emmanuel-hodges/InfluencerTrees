#!/usr/bin/env bash
# Builds the web artifact into dist/web. Needs no AWS credentials.
#
# Today this is a copy plus a build stamp. When a real framework lands, this
# is where `npm run build` goes; the workflow and deploy script do not change.
set -euo pipefail
cd "$(dirname "$0")/.."

commit="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

rm -rf dist/web
mkdir -p dist/web
cp -R web/. dist/web/
sed -i.bak "s/{{COMMIT}}/$commit/g" dist/web/index.html && rm dist/web/index.html.bak
echo "$commit" > dist/web/version.txt

echo "built dist/web at $commit:"
find dist/web -type f | sort
