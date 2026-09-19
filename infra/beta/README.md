# Beta

The beta stage and per-branch previews, all in the beta account, all under
`preview.influencertrees.com`.

| Hostname | Bucket folder | Deployed by |
|---|---|---|
| `preview.influencertrees.com` | `beta/` | every push to `main`, before prod |
| `pr-<n>.preview.influencertrees.com` | `pr-<n>/` | every update to pull request `<n>`; removed when it closes |

One bucket, one certificate, one distribution. A CloudFront function rewrites
each request's path to the folder named after the first hostname label, so a
new preview is a sync to a new folder — no Terraform, no waiting on CloudFront.

## Why the zone is here

The apex zone lives in prod, and beta must never be able to write to it. So
prod delegates this one subtree to a zone in this account with a single NS
record, and everything beta needs lands in the delegated zone.

## First apply — two steps

The certificate validates through DNS records in the delegated zone, and
those only resolve once prod's NS record points here. That record cannot be
written until the zone exists. So, from a laptop with SSO:

```bash
cd infra/beta
cp terraform.tfvars.example terraform.tfvars      # fill in the account ID
cp backend.hcl.example backend.hcl                # fill in the state bucket
export AWS_PROFILE=iad-tf-beta
../../scripts/init-infra.sh beta
terraform apply -target=aws_route53_zone.preview
terraform output preview_zone_name_servers
```

Copy the four name servers into `infra/prod/delegations.tf`, apply prod with
`AWS_PROFILE=iad-tf-prod scripts/deploy-infra.sh prod`, then finish beta with
`scripts/deploy-infra.sh beta`. Every apply after that is CI's.

## The API behind previews

Every preview shares the beta stage's backend. The distribution has a second
origin for `/api/*` — the beta API Gateway, one Lambda, one table, one
sending identity — and that behaviour does no prefix routing, so
`pr-12.preview.influencertrees.com/api/me` and
`preview.influencertrees.com/api/me` reach the same function and the same
rows. A preview therefore tests its branch's front end against the API last
deployed to beta from `main`, and data written from a preview is beta's
data.

### Email stays in the SES sandbox

Beta is left in the sandbox on purpose: SES delivers only to addresses
verified in this account, so nothing a branch does can mail a stranger. To
receive login codes or invitations from beta, an address has to be verified
once, the founder's and every tester's alike. The script creates the
identity, or reports where an existing one stands, and AWS emails the link
to click:

```bash
AWS_PROFILE=iad-tf-beta scripts/verify-recipient.sh beta you@example.com
```

An invitation to an address that is not yet verified is refused by SES. The
API reports it as `unverified_recipient`, the site tells the convincer, and
*Resend invitation* delivers once the link has been clicked.

Production access is requested for prod alone, by a human — the deploy role
is denied `ses:PutAccountDetails`. Whether DKIM has verified, and which
hosted zone SES expects the records in, comes from
`AWS_PROFILE=iad-tf-beta-vo scripts/check-ses.sh beta`.

### The development table

`inftrees-app-dev` is a second table in this account, created by the same
module, for laptops and Codespaces. The API defaults to it when `TABLE_NAME`
is unset and logs email instead of sending it when `EMAIL_MODE` is unset, so
local development is `export AWS_PROFILE=iad-tf-beta` and run — no Docker,
no DynamoDB emulator. No backups and no deletion protection: it holds
throwaway data.
