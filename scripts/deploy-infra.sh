#!/usr/bin/env bash
# Applies the main infrastructure for one environment.
#
#   scripts/deploy-infra.sh prod             apply
#   PLAN_ONLY=1 scripts/deploy-infra.sh prod plan, change nothing
#
# State bucket: TF_STATE_BUCKET, or infra/<env>/backend.hcl on a laptop.
# Credentials: whatever the AWS SDK finds — the OIDC role in CI, or
# AWS_PROFILE=iad-tf-<env> on a laptop. The account guard reads
# TF_VAR_account_id in CI and terraform.tfvars locally.
set -euo pipefail
env_name="${1:?usage: deploy-infra.sh <environment>}"
cd "$(dirname "$0")/../infra/$env_name"

if [[ -n "${TF_STATE_BUCKET:-}" ]]; then
  backend=(-backend-config="bucket=$TF_STATE_BUCKET")
elif [[ -f backend.hcl ]]; then
  backend=(-backend-config=backend.hcl)
else
  echo "set TF_STATE_BUCKET or create backend.hcl (see backend.hcl.example)" >&2
  exit 1
fi

terraform init -input=false -no-color "${backend[@]}"

if [[ -n "${PLAN_ONLY:-}" ]]; then
  terraform plan -input=false -no-color
else
  terraform apply -input=false -no-color -auto-approve
fi
