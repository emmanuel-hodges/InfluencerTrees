#!/usr/bin/env bash
# Formatting and validation for every Terraform root. Needs no AWS
# credentials and no backend; the only network access is provider download.
#
# Each root is checked in a throwaway TF_DATA_DIR so a backend initialised by
# an earlier deploy-infra.sh run in the same checkout cannot leak in.
set -euo pipefail
cd "$(dirname "$0")/.."

terraform fmt -check -recursive -diff infra

for root in infra/bootstrap/beta infra/bootstrap/prod infra/beta infra/prod; do
  echo "== $root"
  scratch="$(mktemp -d)"
  (
    cd "$root"
    export TF_DATA_DIR="$scratch"
    terraform init -backend=false -input=false -no-color >/dev/null
    terraform validate -no-color
  )
  rm -rf "$scratch"
done
