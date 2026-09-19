#!/usr/bin/env bash
# Asks AWS to take one environment's SES account out of the sandbox, so it
# can mail addresses that are not verified identities in the account. AWS
# reviews the request, usually within a day, and answers in a support case
# and by email to the contact address given here. Founder-only: the deploy
# role is denied ses:PutAccountDetails on purpose, so leaving the sandbox
# stays a human decision, made by hand over an SSO session.
#
#   AWS_PROFILE=iad-tf-beta scripts/request-ses-production.sh beta founder@example.com
set -euo pipefail
env_name="${1:?usage: request-ses-production.sh <environment> <contact-email>}"
contact="${2:?usage: request-ses-production.sh <environment> <contact-email>}"
scripts="$(cd "$(dirname "$0")" && pwd)"

if [[ "$(aws sesv2 get-account --query ProductionAccessEnabled --output text)" == "True" ]]; then
  echo "$env_name already has SES production access."
  exit 0
fi
status="$(aws sesv2 get-account --query 'Details.ReviewDetails.Status' --output text)"
if [[ "$status" == "PENDING" ]]; then
  case_id="$(aws sesv2 get-account --query 'Details.ReviewDetails.CaseId' --output text)"
  echo "A request is already under review: case $case_id. Wait for AWS's answer."
  exit 0
fi

# The sending domain, from the environment's Terraform state; the site is
# served at the same name, which is what the reviewers will look at.
"$scripts/init-infra.sh" "$env_name" >/dev/null
domain="$(cd "$scripts/../infra/$env_name" && terraform output -raw ses_identity)"
website="https://$domain"

stage_note=""
if [[ "$env_name" == "beta" ]]; then
  stage_note=" This is the pre-production stage of https://influencertrees.com, which runs in a separate AWS account and will request production access on its own."
fi

use_case="InfluencerTrees ($website) is a membership site.${stage_note} It sends transactional email only, of two kinds. (1) A six-digit one-time sign-in code, sent to a member's own address when they ask to sign in; there are no passwords. (2) One invitation, sent when a signed-in member enters the address of a person they have spoken with and who agreed to join, telling that person how to sign in. Addresses are typed in one at a time by authenticated members. There are no mailing lists, imports, purchased or scraped addresses, and no marketing or bulk mail; nothing is sent on a schedule, so an address only ever receives a code it asked for or an invitation from a member who knows the person. Expected volume at this stage is under 100 messages a day. Safeguards: sign-in codes are limited to three per address per fifteen minutes and that endpoint is throttled at the API gateway; a second invitation to the same address has a ten-minute cooldown; the account-level suppression list is enabled for bounces and complaints, and reputation metrics are enabled on the configuration set every message goes through, so a bounced or complained-about address receives nothing further. Mail is sent from no-reply@$domain with DKIM signing and a DMARC record. The website URL is the site itself; sign in from it requires an invitation, which is by design."

aws sesv2 put-account-details \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url "$website" \
  --contact-language EN \
  --additional-contact-email-addresses "$contact" \
  --use-case-description "$use_case"

echo "Requested production access for $env_name ($website). AWS's review:"
aws sesv2 get-account --query 'Details.ReviewDetails' --output table
echo "AWS answers by email to $contact and in a support case, which get-account names once it is opened, usually within a day."
