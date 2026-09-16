#!/usr/bin/env bash
# Applies the main infrastructure for one environment.
#
#   scripts/deploy-infra.sh prod             apply
#   PLAN_ONLY=1 scripts/deploy-infra.sh prod plan, change nothing
#
# State bucket: see init-infra.sh. Credentials: whatever the AWS SDK finds —
# the OIDC role in CI, or AWS_PROFILE=iad-tf-<env> on a laptop. The account
# guard reads TF_VAR_account_id in CI and terraform.tfvars locally.
set -euo pipefail
env_name="${1:?usage: deploy-infra.sh <environment>}"
scripts="$(cd "$(dirname "$0")" && pwd)"

"$scripts/init-infra.sh" "$env_name"
cd "$scripts/../infra/$env_name"

if [[ -n "${PLAN_ONLY:-}" ]]; then
  terraform plan -input=false -no-color
else
  terraform apply -input=false -no-color -auto-approve
fi
