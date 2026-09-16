#!/usr/bin/env bash
# Initialises one environment's Terraform root against its state bucket.
#
#   scripts/init-infra.sh prod
#
# State bucket: TF_STATE_BUCKET, or infra/<env>/backend.hcl on a laptop.
# Idempotent; the other infra scripts call this before anything else.
set -euo pipefail
env_name="${1:?usage: init-infra.sh <environment>}"
cd "$(dirname "$0")/../infra/$env_name"

if [[ -n "${TF_STATE_BUCKET:-}" ]]; then
  backend=(-backend-config="bucket=$TF_STATE_BUCKET")
elif [[ -f backend.hcl ]]; then
  backend=(-backend-config=backend.hcl)
else
  echo "set TF_STATE_BUCKET or create infra/$env_name/backend.hcl (see backend.hcl.example)" >&2
  exit 1
fi

terraform init -input=false -no-color "${backend[@]}"
