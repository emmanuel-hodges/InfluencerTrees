#!/usr/bin/env bash
# Checks a deployed site: the API answers, and it reports the same commit the
# site was built from. CloudFront can serve the previous index.html for a
# moment after an invalidation, so this retries briefly. Needs no credentials.
#
#   scripts/smoke.sh https://preview.influencertrees.com
set -euo pipefail
url="${1:?usage: smoke.sh <https://host>}"

for attempt in 1 2 3 4 5 6; do
  site="$(curl -fsS "$url/version.txt" 2>/dev/null | tr -d '[:space:]' || true)"
  api="$(curl -fsS "$url/api/health" 2>/dev/null | jq -r '.commit // empty' || true)"
  if [[ -n "$site" && "$site" == "$api" ]]; then
    echo "ok: $url serves build $site and its API reports the same"
    exit 0
  fi
  echo "attempt $attempt: site build '${site:-none}', api build '${api:-none}'"
  sleep 10
done

echo "smoke test failed for $url" >&2
exit 1
