#!/usr/bin/env bash
# Formatting and validation for every Terraform root. Needs no AWS
# credentials and no backend; the only network access is provider download.
set -euo pipefail
cd "$(dirname "$0")/.."

terraform fmt -check -recursive -diff infra

for root in infra/bootstrap/beta infra/bootstrap/prod infra/prod; do
  echo "== $root"
  (cd "$root" && terraform init -backend=false -input=false -no-color >/dev/null && terraform validate -no-color)
done
