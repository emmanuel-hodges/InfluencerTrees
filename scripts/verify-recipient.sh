#!/usr/bin/env bash
# Lets one address receive mail from an account that is still in the SES
# sandbox, where SES delivers only to identities verified in that account.
# Creates the address as an email identity, which makes AWS email it a
# verification link (valid for 24 hours), or reports where an existing one
# stands. Founder-only: the pipeline's role is denied the SES data plane, so
# this runs by hand over an SSO session.
#
#   AWS_PROFILE=iad-tf-beta scripts/verify-recipient.sh beta someone@example.com
set -euo pipefail
env_name="${1:?usage: verify-recipient.sh <environment> <email>}"
address="${2:?usage: verify-recipient.sh <environment> <email>}"

if [[ "$(aws sesv2 get-account --query ProductionAccessEnabled --output text)" == "True" ]]; then
  echo "This account has SES production access, so $env_name can already mail any address."
  exit 0
fi

if status="$(aws sesv2 get-email-identity --email-identity "$address" \
    --query VerificationStatus --output text 2>/dev/null)"; then
  if [[ "$status" == "SUCCESS" ]]; then
    echo "$address is verified; $env_name can mail it. Use Resend invitation, or request a code."
  else
    cat <<MSG
$address exists but its status is $status. AWS emailed it a verification link
when it was created, and the link lasts 24 hours. To send a fresh one:

  aws sesv2 delete-email-identity --email-identity "$address"
  scripts/verify-recipient.sh $env_name "$address"
MSG
  fi
  exit 0
fi

aws sesv2 create-email-identity --email-identity "$address" >/dev/null
cat <<MSG
Created. AWS has emailed $address a verification link from
no-reply-aws@amazon.com. Once it is clicked, $env_name can mail that address:
use Resend invitation on the Convince page, or request a sign-in code.
MSG
