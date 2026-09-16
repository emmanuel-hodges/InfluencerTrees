#!/usr/bin/env bash
# Syncs a built site to the environment's bucket and invalidates CloudFront.
#
#   scripts/deploy-web.sh prod [dist-dir]
#
# Reads the bucket and distribution from Terraform outputs, so deploy-infra.sh
# must have run first in this checkout. Same credential rules as that script.
set -euo pipefail
env_name="${1:?usage: deploy-web.sh <environment> [dist-dir]}"
root="$(cd "$(dirname "$0")/.." && pwd)"
dist="${2:-$root/dist/web}"

if [[ ! -f "$dist/index.html" ]]; then
  echo "no $dist/index.html — run scripts/build-web.sh first" >&2
  exit 1
fi

cd "$root/infra/$env_name"
bucket="$(terraform output -raw web_bucket)"
distribution="$(terraform output -raw cloudfront_distribution_id)"
url="$(terraform output -raw site_url)"

aws s3 sync "$dist" "s3://$bucket" --delete --no-progress
invalidation="$(aws cloudfront create-invalidation --distribution-id "$distribution" \
  --paths "/*" --query Invalidation.Id --output text)"

echo "synced $dist to s3://$bucket; invalidation $invalidation"
echo "site: $url"
