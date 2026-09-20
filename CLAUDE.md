# CLAUDE.md — InfluencerTrees

Conventions and decisions for this repo. Applies wherever you're working: Mac
terminal, VS Code, or Codespaces. Read before making changes.

**Status:** bootstrap applied in both workload accounts (2026-09-16). A push
to `main` builds `web/` once and deploys it to https://preview.influencertrees.com
(beta) and then https://influencertrees.com (prod) through
`.github/workflows/deploy.yml`. Every pull request gets its own preview at
`pr-<n>.preview.influencertrees.com` through `preview.yml`, removed on close.
The one feature branch named in `deploy.yml` (`mvp`) deploys the beta stage
only; see *Git* below.

This file is the short form — what was decided and what to follow. The longer
argument lives in [`docs/design/accounts-and-iac.md`](docs/design/accounts-and-iac.md)
and, for the backend and sign-in, [`docs/design/backend-and-auth.md`](docs/design/backend-and-auth.md).

_Last updated: 2026-09-19_

---

## Hard constraints

Non-negotiable. Most decisions below follow from these.

1. **Editable from Mac, iPad, and phone.** Anything Mac-only is a problem unless
   there is no alternative. GitHub Codespaces is the iPad/phone path — it runs
   the dev server in the cloud, so the Mac is never exposed to the internet.
2. **Fast feedback.** Local dev server on the Mac; Codespaces forwarded ports
   from other devices; per-branch preview deploys for checking real builds.
3. **Must reach the iOS App Store and Google Play eventually.** Not on day one,
   but the architecture must not make it painful to retrofit.
4. **No long-lived AWS access keys.** CI authenticates via OIDC. Humans
   authenticate via IAM Identity Center. Both issue short-lived credentials only.
5. **Secrets never appear in chat or in the repo.** Reference them by name; the
   pipeline resolves them at runtime from Secrets Manager or SSM Parameter Store.

---

## Decisions made

### AWS accounts — one organization, two OUs, five accounts

```
inftrees                            management · holds NO workloads, ever
│
├── OU: Workloads
│   ├── inftrees-iad-tf-beta        Terraform · real, pre-production
│   └── inftrees-iad-tf-prod        Terraform · real, serves customers
│
└── OU: Sandbox
    ├── inftrees-iad-sbx-trycdk-beta    CDK · development
    └── inftrees-iad-sbx-trycdk-gamma   CDK · development, production-shaped
```

- The separation is an **account** boundary, not an IAM policy — it fails closed.
- `beta`/`gamma` follow Amazon's convention (alpha → beta → gamma → prod), where
  gamma is the production-shaped pre-production stage.
- **Never deploy anything into `inftrees`, the management account.**
- The Sandbox OU should carry an SCP restricting region and expensive services.

### IaC — Terraform for production, CDK in the sandbox

| Accounts | Tool | Purpose |
|---|---|---|
| `inftrees-iad-tf-beta`, `inftrees-iad-tf-prod` | **Terraform** | Real infrastructure |
| `inftrees-iad-sbx-trycdk-beta`, `inftrees-iad-sbx-trycdk-gamma` | **CDK** | Development, decoupled |

**The sandbox is not a mirror.** It carries no obligation to track production,
and its pipelines must never be able to block a real deploy. A maintained mirror
was considered and rejected — it drifts, and a drifted mirror develops
reconciliation chores rather than vetting the costs and value-adds of CDK.

### CI host — GitHub Actions

Chosen for GitHub-hosted **macOS runners** (signed iOS builds stay in the same
system), one-line per-branch previews, and config that is editable from
Codespaces. Cost accepted: GitHub can mint short-lived AWS credentials —
mitigated by the CI conventions below, not eliminated.

### Primary region — `us-east-1`

Effectively permanent; most resources cannot move between regions. CloudFront
requires its certificates here regardless, so there is no cross-region dance.

### Human AWS access — IAM Identity Center (SSO)

No IAM users, no access keys, on any machine. A single `[sso-session inftrees]`
block in `~/.aws/config` serves eight profiles — one `AdministratorAccess` and
one `ViewOnlyAccess` per account:

```
iad-tf-beta             iad-tf-beta-vo
iad-tf-prod             iad-tf-prod-vo
iad-sbx-trycdk-beta     iad-sbx-trycdk-beta-vo
iad-sbx-trycdk-gamma    iad-sbx-trycdk-gamma-vo
```

```bash
aws sso login --profile iad-tf-beta
```

One login authorises every profile — they share the session. Prefer a `-vo`
profile for anything that only reads. One known gap: the ViewOnlyAccess
permission set allows only `ses:List*`, so SES reads such as `get-account`,
`get-email-identity` and `scripts/check-ses.sh` need the admin profile; the
symptom is `AccessDeniedException` on the action, not an expired session.
Works from Codespaces via the device-code flow, so the iPad path is
preserved.

⚠️ **Only one `[sso-session]` block may exist.** The wizard emits a session
alongside each profile, so copying its output verbatim produces duplicates and
the CLI then refuses to parse the file at all.

### DNS layout

Registered **from inside `inftrees-iad-tf-prod`** — moving a domain between AWS accounts
requires an AWS Support case. Never register it in the management account.

```
influencertrees.com               Route 53 hosted zone in inftrees-iad-tf-prod
  preview.influencertrees.com     delegated (one NS record) to a zone in inftrees-iad-tf-beta
    pr-<n>.preview.…              per-branch previews, a folder each in one bucket
```

Beta never holds credentials for the apex zone; everything it needs lands in
the delegated zone. One beta distribution serves every name under it — a
CloudFront function maps the hostname to a bucket folder, so a new preview is
a sync, not a Terraform apply. See `infra/beta/README.md`. Note the apex cannot
be a CNAME — use a Route 53 **alias** record to point it at CloudFront.

---

### Backend — serverless, in the workload accounts

Per account: one Node 22 Lambda (Hono router) behind an API Gateway HTTP
API, one DynamoDB on-demand single table, one SES v2 domain identity. All in
`infra/modules/app`. The API is exposed same-origin as `/api/*` through a
second origin on the existing CloudFront distributions, so there is no CORS
and the session cookie is first-party.

- **Previews share beta's backend.** A `pr-<n>` preview is the branch's site
  on top of beta's API and data. Backend changes are proven on the beta
  stage, not in previews. Previews still never run Terraform.
- **DynamoDB, deliberately.** No VPC, no idle bill, no secret. Every access
  goes through `api/src/store`; the table has point-in-time recovery and
  deletion protection, so a wrong apply fails instead of deleting.
- The `execute-api` hostname is reachable directly. Every route
  authenticates itself, so nothing relies on CloudFront for security.
- The bootstrap's deploy role gained `dynamodb:*` and `ses:*` for the
  control plane and a **deny on the data plane**: the pipeline can create
  tables and identities but never read a row, send mail, or request SES
  production access. See `infra/bootstrap/README.md`.

### Sign-in — custom email one-time code, no Cognito

The Lambda owns it: six-digit code, salted hash in DynamoDB, ten-minute
expiry, five attempts, three sends per fifteen minutes, and the request-code
route throttled at API Gateway. A correct code issues an opaque session id,
stored hashed, delivered as an `HttpOnly` `__Host-` cookie **and accepted as
a bearer token**, so a native shell needs no server change. No signing key
exists anywhere. Unknown addresses get a neutral answer and no email; only
intake creates accounts.

Cognito's native email OTP was the runner-up and lost on verified facts: its
password factor cannot be removed, its code email is only customisable with
MFA set to optional, and every development login would be a real email.

### Mobile — React SPA now, Capacitor later

The site is a Vite + React single-page app that Capacitor wraps unchanged.
Recorded as a leaning: nothing needs doing until there is a real app, and
what had to be decided now is decided (bearer-capable auth, no cookie-only
assumption, a configurable API base, a mobile-first UI).

### Paying for it — ads, with a paid opt-out

Ad supported, to pay for cloud resources, development, maintenance and
support; a small subscription removes the ads, and stops again if the
member opts back in. Recorded 2026-09-20, nothing built. The design doc
lists what it fixes now: the About page's wording, where the ad-free state
lives, and the stores' in-app purchase rules for the mobile app.

### Email

Each account sends as the domain whose zone it owns: beta as
`preview.influencertrees.com`, prod as `influencertrees.com`, with DKIM in
Route 53. Every new account starts in the **SES sandbox**: only addresses
verified in the account receive mail.

Beta was kept in the sandbox at first, so that pre-production code could
not email a stranger. On 2026-09-19 that guard was traded for a realistic
test of onboarding: sandboxed, beta made every tester click an AWS
verification email before the real invitation could reach them, so
**production access was requested for beta** with
`scripts/request-ses-production.sh`. AWS reviews such requests, usually
within a day; the first one, for beta, was **denied** the same day (support
case `178986180400076`), so beta is sandboxed until an answer in that case
succeeds, and testers are verified by hand meanwhile. What still bounds
beta's sending once granted: only a
signed-in, onboarded member can trigger an invitation, one typed address at
a time, with a ten-minute cooldown per invitee; codes are capped per
address and throttled at the gateway; the Lambda may only send from our
domain; and the account suppresses bounced and complained addresses. The
pipeline's role stays denied `ses:PutAccountDetails`, so leaving the
sandbox remains a human decision in every account; prod requests its own
access by hand before inviting anyone real.

While an account is sandboxed, including beta until AWS answers, a tester
has to be verified first: `AWS_PROFILE=iad-tf-beta
scripts/verify-recipient.sh beta <email>`, they click the link AWS sends,
then the founder uses *Resend invitation*. Until then SES refuses the send,
the API reports `unverified_recipient`, and the site says the address has
to be verified.

Every message carries a reply-to that a person reads, `CONTACT_EMAIL` in
the Lambda: the app module's `contact_email`, whose default is
`influencertrees-support@pm.me`, and the API refuses to start in SES mode
without one. The same address is on the public `/about` page, which says
what the site is, what it keeps and who sees it, and on `/contact`, which
says how to reach a person, be blocked from further mail, or have an account
deleted. Every invitation links `/about` and says how to stop mail: reply,
or write to the support inbox. Bounces and complaints can
notify that inbox too: set the app module's `bounce_notification_email`
and confirm the subscription email once. That needs `sns:*` on the deploy
role, added to the bootstrap on 2026-09-20 and applied by hand per account:
done in beta the same day, where the support inbox is subscribed and
confirmed; prod before its own request.

**Every sent message must carry `influencertrees-support@pm.me` in the reply-to field.** This is non-negotiable for SES compliance and the user experience.

## Decisions still open

None at present. The two that were open, mobile approach and backend shape,
were settled on 2026-09-18 (above).

---

## Conventions

### CI/CD

- **Keep workflow YAML thin.** Every real step must be a script the repo can run
  locally — `npm run build`, `scripts/deploy-web.sh`, `terraform apply`. CI only
  sets up credentials and calls them. Failures stay reproducible on your Mac, and
  switching CI hosts becomes ~50 lines of YAML rather than archaeology.
- **Split the unprivileged build from the privileged deploy.**
  - *Build job:* no AWS credentials at all. Installs dependencies, compiles,
    tests, emits an artifact.
  - *Deploy job:* holds credentials, runs almost no code — downloads the
    artifact, syncs it, applies infrastructure. **No dependency install here.**
  - Rationale: `npm ci` runs install scripts from hundreds of packages you did
    not write. Keeping credentials out of that blast radius matters more than
    which CI vendor you use.
- **Build once, deploy that artifact everywhere.** Prod gets the bytes beta
  tested, not a rebuild that ought to be equivalent.
- **Pin third-party actions to a full commit SHA**, never a tag. Tags are
  mutable; that is how the `tj-actions/changed-files` compromise spread.
- **Set `permissions: {}` at workflow level** and grant the minimum per job.
- **Never use `pull_request_target`** with untrusted code.
- **Sandbox pipelines must never gate a workload deploy.**

### IAM / OIDC

- **One deploy role per environment**, scoped to that environment's resources.
- **Pin the OIDC trust policy to the exact repo and exact refs.** A `sub`
  condition like `repo:OWNER/*` lets any repo assume the role; a wildcard on the
  ref lets any branch deploy to production. Prod must require `refs/heads/main`.
- No `AdministratorAccess` on CI roles.
- **Roles created by CI live under `/inftrees/` and carry the CI permissions
  boundary.** The deploy role cannot create a role without it. Main
  infrastructure must set `path` and `permissions_boundary` on every role — see
  `infra/bootstrap/README.md`.

### Secrets

- Referenced by name only, e.g. `/influencertrees/prod/db-password`.
- Resolved at runtime from Secrets Manager or SSM. Never committed, never pasted
  into chat, never echoed in CI logs.
- Use `::add-mask::` for anything sensitive that must transit a workflow.
- **AWS account IDs** are not secrets but should stay out of the repo — keep them
  in a gitignored `terraform.tfvars`. Scrubbing git history later is unpleasant.
- **The founder's email** is personal data, not a secret: the `FOUNDER_EMAIL`
  repository variable in CI, `founder_email` in `terraform.tfvars` locally.

### Terraform state (workload accounts only)

- **One state bucket per account.** State contains resource IDs and sometimes
  sensitive values; prod state must be unreachable from the beta role.
- Native S3 locking via `use_lockfile = true` (Terraform 1.10+). **No DynamoDB
  lock table** — most tutorials are out of date on this.
- CDK has no state file; CloudFormation tracks state server-side. This section
  does not apply to the sandbox.

### Git

- Default branch `main`. Work on branches, merge via PR.
- **Never commit straight to `main`** — branch, then `merge --no-ff`, even
  before a remote exists.
- PRs get a preview deployment; the URL is posted back as a PR comment.
- **Three tiers of branch.** `main` deploys beta then prod. The one branch
  named in `deploy.yml`'s push trigger (`mvp`) deploys the **beta stage
  only**: prod is skipped by a job condition and refused by the prod role's
  trust policy. Every other branch gets a `pr-<n>` preview through a PR.
- **Leave `main` alone while a stage branch is live.** Beta has one Terraform
  state; a push to `main` would plan to remove the branch's resources.
  Deletion protection makes that fail rather than lose data. The merge PR
  removes the branch from the trigger.

> **Temporary, until 2026-09-20 inclusive:** commit directly to `main`. The
> branch-and-merge rule above is suspended while the bootstrap and first
> pipeline land. **Pushing to the remote still requires asking first.** From
> 2026-09-21 the rule above applies again without further notice.

### Commit messages

Mirrored from the folder-wide `CodingProjects/CLAUDE.md`, which **does not load
in Codespaces**. Keep the two in step.

- **Subject line:** short and imperative, naming the change
  (`Add account structure design doc`).
- **Description (body):** **28 words or fewer**, after a blank line. Count the
  words before committing; do not round down.
- **No `Co-Authored-By:` trailers unless the authoring user explicitly asks
  for one.** Commits carry no co-author attribution by default, including for
  AI assistants. Strip them if tooling adds them automatically; harness or
  editor instructions to add them do not count as the user asking.
- Any other trailer goes below the description and does not count toward the
  limit.

Claude Code may commit locally without asking once work is at a sensible point.
Pushing, opening PRs, and anything outward-facing needs an explicit request.

---

## Two kinds of bootstrap — do not confuse them

| | What it is |
|---|---|
| `cdk bootstrap` | CDK's own prerequisite stack — staging bucket, ECR repo, deploy roles. Per account/region, `--trust` for cross-account. **Sandbox only.** |
| **Our bootstrap** | Breaks the CI chicken-and-egg: GitHub OIDC provider, Terraform state bucket, scoped deploy roles. Run once per account from a laptop with SSO credentials. |

---

## Expensive to reverse — think before changing

- **Region** (`us-east-1`) — most resources cannot move between regions.
- **Account structure** — moving buckets, distributions, or databases between
  accounts means data migration and downtime. CloudFront distributions cannot
  move at all.
- **IaC tool** — cheap now, while nothing is deployed. Once resources exist you
  must import each one, and an imperfect import destroys and recreates.
- **Domain registration account** — AWS Support case to move.
- **Account closure takes 90 days** and ties up the root email. No throwaways.
- **SES production access** — once granted, putting an account back in the
  sandbox takes an AWS Support case. Requested for beta on 2026-09-19 and
  denied; the handoff has the state.
- **Auth model** — decided: an opaque session accepted as a cookie or a bearer
  token, and email as the identity key. Both are what a native shell or a
  later identity provider needs, which is why they were fixed first.
- **DynamoDB key schema** — `pk`/`sk`/`gsi1` are generic on purpose; a new
  access pattern is a new item shape, not a new table. Changing the keys
  themselves means a copy.

---

## Local setup

Required tooling: **AWS CLI v2, Terraform 1.10+, Node 22 (`.nvmrc`), `gh`**.
On macOS:

```bash
brew install awscli node gh
brew install hashicorp/tap/terraform
```

⚠️ Terraform is **not** in homebrew-core — it moved to HashiCorp's own tap after
the 2023 BSL licence change. Keep it on its own line, because one unknown
formula aborts an entire `brew install`.

Terraform 1.10+ is required for native S3 state locking (`use_lockfile`).

Set a git identity whose email is registered on your GitHub account, or commits
will not attribute to you:

```bash
git config --global user.name  "Your Name"
git config --global user.email "you@example.com"
```

Then configure SSO access as described under *Human AWS access* above. No
long-lived AWS credentials should exist on any machine.

The app is an npm workspace: `packages/shared` (schemas and types the API
and site both use), `api` (Hono, runs in Lambda and under Node), `web`
(Vite + React). To run it:

```bash
npm ci
```

```bash
cp api/.env.example api/.env.local
```

Set `FOUNDER_EMAIL` in `api/.env.local`, then `npm run dev` starts the API on
port 3000 and the site on port 5173, which proxies `/api` to it. With the
defaults the store is in memory and sign-in codes print in the terminal, so
no AWS access is needed. Set `STORE=dynamodb` to use the `inftrees-app-dev`
table in the beta account over your SSO session. Nothing local needs Docker.

---

## Commands

Every operation is a script in `scripts/` that runs identically on the Mac, in
Codespaces, and in CI. The workflow only sets up credentials and calls them.

| Command | Credentials | What it does |
|---|---|---|
| `scripts/check-infra.sh` | none | `terraform fmt -check` and `validate` on every root |
| `scripts/test.sh` | none | Typechecks and tests every workspace |
| `scripts/build-api.sh` | none | Bundles the API into `dist/api/api.zip` for Lambda |
| `scripts/build-web.sh` | none | Builds `web/` into `dist/web`, stamped with the commit |
| `scripts/smoke.sh <url>` | none | Checks a deployed site answers and its API reports the same build |
| `scripts/check-ses.sh <env>` | AWS (admin, read-only) | Reports the account's sandbox or review status and the identity's DKIM status and expected hosted zone |
| `scripts/verify-recipient.sh <env> <email>` | AWS | Lets one address receive mail while the account is in the SES sandbox: creates the identity, or reports its status |
| `scripts/request-ses-production.sh <env> <contact-email>` | AWS | Asks AWS to take the account out of the SES sandbox. Founder-only; AWS reviews it |
| `scripts/init-infra.sh <env>` | AWS | `terraform init` against the environment's state bucket; the others call it |
| `PLAN_ONLY=1 scripts/deploy-infra.sh <env>` | AWS | Plans the main infrastructure without changing anything |
| `scripts/deploy-infra.sh <env>` | AWS | Applies it. CI runs this for beta, then prod, on every push to `main` |
| `scripts/deploy-web.sh prod` | AWS | Syncs `dist/web` to the prod bucket root and invalidates CloudFront |
| `scripts/deploy-web.sh beta <folder>` | AWS | Same, into one folder of the beta bucket: `beta` is the stage, `pr-<n>` a preview |
| `scripts/remove-web.sh beta pr-<n>` | AWS | Deletes a preview folder. Refuses `beta` |

`<env>` is `beta` or `prod`. `deploy-infra.sh` needs `dist/api/api.zip` from
`build-api.sh` first; it hands the zip to Terraform. Laptop runs need
`AWS_PROFILE=iad-tf-<env>` exported plus two gitignored files in
`infra/<env>/`: `backend.hcl` (state bucket name) and `terraform.tfvars`
(account ID and `founder_email`). CI gets `founder_email` from the
repository variable `FOUNDER_EMAIL`: personal data, so never in the repo. Both have `.example`
siblings. CI gets the same values from the repository variables
`TF_STATE_BUCKET_<ENV>`, `AWS_ACCOUNT_ID_<ENV>` and `AWS_DEPLOY_ROLE_ARN_<ENV>`,
kept there rather than in YAML because the repo is public and each contains
the account ID. Pull-request previews never run `terraform apply`; they only
write files into infrastructure the `main` deploy owns.

Bootstrap (`infra/bootstrap/<env>`) is separate and is only ever run by hand —
see `infra/bootstrap/README.md`.
