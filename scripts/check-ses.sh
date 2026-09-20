#!/usr/bin/env bash
# Reports one environment's SES standing: whether the account is out of the
# sandbox or has a production-access review pending or denied, and whether
# the domain identity's DKIM has verified and which DKIM hosted zone SES
# expects the CNAME records to point at. Read-only, but it needs the
# AdministratorAccess profile: the ViewOnlyAccess permission set allows only
# ses:List*, and both reads here are Get calls.
#
#   AWS_PROFILE=iad-tf-beta scripts/check-ses.sh beta
set -euo pipefail
env_name="${1:?usage: check-ses.sh <environment>}"
scripts="$(cd "$(dirname "$0")" && pwd)"

"$scripts/init-infra.sh" "$env_name" >/dev/null
cd "$scripts/../infra/$env_name"
identity="$(terraform output -raw ses_identity)"

aws sesv2 get-account --output table \
  --query '{ProductionAccess: ProductionAccessEnabled, ReviewStatus: Details.ReviewDetails.Status, SupportCase: Details.ReviewDetails.CaseId, Max24HourSend: SendQuota.Max24HourSend}'

aws sesv2 get-email-identity --email-identity "$identity" --output table \
  --query '{Identity: IdentityType, VerifiedForSending: VerifiedForSendingStatus, DkimStatus: DkimAttributes.Status, SigningHostedZone: DkimAttributes.SigningHostedZone}'

cat <<MSG

ProductionAccess False is the sandbox: only addresses verified in the account
receive mail (scripts/verify-recipient.sh). ReviewStatus refers to the last
request made with scripts/request-ses-production.sh; AWS explains a denial
in the support case named above and in the email it sent the contact.

The module writes CNAME records pointing at <token>.dkim.amazonses.com. If
SigningHostedZone above is a different zone, set dkim_hosted_zone to that
value in infra/$env_name/terraform.tfvars and apply again. DkimStatus becomes
SUCCESS once SES has seen the records, which can take up to 72 hours.
MSG
