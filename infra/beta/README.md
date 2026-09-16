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
