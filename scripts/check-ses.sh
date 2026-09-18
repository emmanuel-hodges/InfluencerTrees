#!/usr/bin/env bash
# Reports one environment's SES domain identity: whether DKIM has verified
# and which DKIM hosted zone SES expects the CNAME records to point at.
# Read-only; a -vo profile is enough.
#
#   AWS_PROFILE=iad-tf-beta-vo scripts/check-ses.sh beta
set -euo pipefail
env_name="${1:?usage: check-ses.sh <environment>}"
scripts="$(cd "$(dirname "$0")" && pwd)"

"$scripts/init-infra.sh" "$env_name" >/dev/null
cd "$scripts/../infra/$env_name"
identity="$(terraform output -raw ses_identity)"

aws sesv2 get-email-identity --email-identity "$identity" --output table \
  --query '{Identity: IdentityType, VerifiedForSending: VerifiedForSendingStatus, DkimStatus: DkimAttributes.Status, SigningHostedZone: DkimAttributes.SigningHostedZone}'

cat <<MSG

The module writes CNAME records pointing at <token>.dkim.amazonses.com. If
SigningHostedZone above is a different zone, set dkim_hosted_zone to that
value in infra/$env_name/terraform.tfvars and apply again. DkimStatus becomes
SUCCESS once SES has seen the records, which can take up to 72 hours.
MSG
