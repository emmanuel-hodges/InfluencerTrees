# App

The backend for one environment: a Node 22 Lambda behind an API Gateway HTTP
API, a DynamoDB table, and an SES domain identity. CloudFront (the
`static-site` module) proxies `/api/*` to the API so the browser sees one
origin and the session cookie is first-party.

| Resource | Purpose |
|---|---|
| **`inftrees-app-<env>`** | The table. On-demand, one overloaded index, TTL on `expiresAt`, point-in-time recovery, deletion protection. |
| **`inftrees-app-dev`** | Beta only. The table laptops and Codespaces use over SSO; no backups, no protection. |
| **SES identity** | The sending domain, DKIM-signed. Three DKIM CNAMEs and a `_dmarc` TXT (`p=none`) go in the zone. |
| **Configuration set** | `inftrees-<env>`. Every send goes through it; send, delivery, bounce, complaint and reject counts land in CloudWatch. |
| **Execution role** | `/inftrees/inftrees-api-<env>`, boundary-capped. Data plane on the table, `ses:SendEmail` on the identity, logs. No Scan. |
| **Function** | `inftrees-api-<env>`, arm64, JSON logs, 30-day retention. Configuration arrives as environment variables. |
| **HTTP API** | `$default` route to the function, throttled; `POST /api/auth/request-code` throttled harder because it sends mail. |

## The bootstrap contract

The deploy role may create an IAM role only under `/inftrees/` and only with
the CI permissions boundary attached. The module sets both, composing the
boundary ARN from its deterministic name, `inftrees-ci-boundary-<env>`. The
boundary also caps the role, and it lists exactly the DynamoDB data-plane
actions and the two SES send actions this module grants — see
`infra/bootstrap/README.md`.

## DKIM verification

The identity only sends once SES has seen the three DKIM CNAMEs, which can
take up to 72 hours. The records point at `<token>.dkim.amazonses.com`, but
SES occasionally assigns an identity-specific `SigningHostedZone`. Check:

```bash
AWS_PROFILE=iad-tf-beta-vo scripts/check-ses.sh beta
```

If the reported zone differs, set `dkim_hosted_zone` to it in the root's
`terraform.tfvars` and apply again.

## The SES sandbox

A new account sends only to verified addresses, at 200 a day. Beta stays
that way on purpose — nothing a branch does can mail a stranger. Production
access is requested for prod alone, by a human: the deploy role is denied
`ses:PutAccountDetails`.
