#!/usr/bin/env bash
# Syncs a built site to an environment's bucket and invalidates CloudFront.
#
#   scripts/deploy-web.sh prod            bucket root; the single prod site
#   scripts/deploy-web.sh beta beta       folder "beta": preview.influencertrees.com
#   scripts/deploy-web.sh beta pr-12      folder "pr-12": pr-12.preview.influencertrees.com
#
# A folder is required in an environment with prefix routing and refused in
# one without it, so the two cannot be mixed up. DIST_DIR overrides dist/web.
# Reads bucket and distribution from Terraform outputs; same credential rules
# as deploy-infra.sh.
set -euo pipefail
env_name="${1:?usage: deploy-web.sh <environment> [folder]}"
folder="${2:-}"
scripts="$(cd "$(dirname "$0")" && pwd)"
dist="${DIST_DIR:-$scripts/../dist/web}"

if [[ ! -f "$dist/index.html" ]]; then
  echo "no $dist/index.html — run scripts/build-web.sh first" >&2
  exit 1
fi
if [[ -n "$folder" && ! "$folder" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "folder '$folder' must be a valid DNS label: lowercase letters, digits, hyphens" >&2
  exit 1
fi

"$scripts/init-infra.sh" "$env_name" >/dev/null
cd "$scripts/../infra/$env_name"
bucket="$(terraform output -raw web_bucket)"
distribution="$(terraform output -raw cloudfront_distribution_id)"
domain="$(terraform output -raw domain_name)"
default_prefix="$(terraform output -raw default_prefix 2>/dev/null || true)"

if [[ -n "$default_prefix" && -z "$folder" ]]; then
  echo "$env_name uses prefix routing; name the folder to deploy, e.g. $default_prefix" >&2
  exit 1
elif [[ -z "$default_prefix" && -n "$folder" ]]; then
  echo "$env_name serves a single site from the bucket root; drop the folder argument" >&2
  exit 1
fi

if [[ -n "$folder" ]]; then
  target="s3://$bucket/$folder"
  paths="/$folder/*"
  url="https://$folder.$domain"
  [[ "$folder" == "$default_prefix" ]] && url="https://$domain"
else
  target="s3://$bucket"
  paths="/*"
  url="https://$domain"
fi

# Vite names everything under assets/ by content hash, so those files can be
# cached forever; index.html and version.txt must always be fetched fresh or
# a browser keeps an old shell after a deploy. Two passes, both pruning.
aws s3 sync "$dist" "$target" --delete --no-progress \
  --exclude "assets/*" --cache-control "no-cache"
aws s3 sync "$dist" "$target" --delete --no-progress \
  --exclude "*" --include "assets/*" --cache-control "public,max-age=31536000,immutable"
invalidation="$(aws cloudfront create-invalidation --distribution-id "$distribution" \
  --paths "$paths" --query Invalidation.Id --output text)"

echo "synced $dist to $target; invalidation $invalidation"
echo "site: $url"
[[ -n "${GITHUB_OUTPUT:-}" ]] && echo "url=$url" >> "$GITHUB_OUTPUT"
exit 0
