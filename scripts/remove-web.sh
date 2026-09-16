#!/usr/bin/env bash
# Removes one folder from an environment's bucket and invalidates it, for a
# preview whose pull request has closed.
#
#   scripts/remove-web.sh beta pr-12
#
# Refuses the default folder, which is the beta stage itself. Same credential
# rules as deploy-infra.sh.
set -euo pipefail
env_name="${1:?usage: remove-web.sh <environment> <folder>}"
folder="${2:?usage: remove-web.sh <environment> <folder>}"
scripts="$(cd "$(dirname "$0")" && pwd)"

if [[ ! "$folder" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "folder '$folder' must be a valid DNS label: lowercase letters, digits, hyphens" >&2
  exit 1
fi

"$scripts/init-infra.sh" "$env_name" >/dev/null
cd "$scripts/../infra/$env_name"
bucket="$(terraform output -raw web_bucket)"
distribution="$(terraform output -raw cloudfront_distribution_id)"
default_prefix="$(terraform output -raw default_prefix 2>/dev/null || true)"

if [[ -z "$default_prefix" ]]; then
  echo "$env_name has no prefix routing; nothing to remove per folder" >&2
  exit 1
fi
if [[ "$folder" == "$default_prefix" ]]; then
  echo "refusing to remove '$folder': that is the environment's own site" >&2
  exit 1
fi

aws s3 rm "s3://$bucket/$folder" --recursive --only-show-errors
invalidation="$(aws cloudfront create-invalidation --distribution-id "$distribution" \
  --paths "/$folder/*" --query Invalidation.Id --output text)"

echo "removed s3://$bucket/$folder; invalidation $invalidation"
