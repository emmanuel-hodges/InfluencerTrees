#!/usr/bin/env bash
# Bundles the API into one file and zips it for Lambda, into dist/api. Needs
# no AWS credentials. scripts/deploy-infra.sh hands the zip to Terraform, so
# beta and prod run byte-identical code.
set -euo pipefail
cd "$(dirname "$0")/.."

scripts/lib/ensure-deps.sh
commit="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

rm -rf dist/api
mkdir -p dist/api

# Everything is bundled, the AWS SDK included, so the deployed bytes do not
# depend on whichever SDK version the Lambda runtime happens to ship. The
# banner gives bundled CommonJS dependencies a working require() under ESM.
npx esbuild api/src/lambda.ts \
  --bundle --platform=node --target=node22 --format=esm \
  --outfile=dist/api/index.mjs \
  --define:process.env.BUILD_COMMIT="\"$commit\"" \
  --define:process.env.NODE_ENV='"production"' \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
  --log-level=warning

# A fixed timestamp keeps the zip, and so Terraform's source hash, identical
# for identical code: an unchanged API is not redeployed.
touch -t 202601010000 dist/api/index.mjs
(cd dist/api && zip -q -X api.zip index.mjs)
echo "$commit" > dist/api/version.txt

echo "built dist/api/api.zip at $commit ($(du -h dist/api/api.zip | cut -f1))"
