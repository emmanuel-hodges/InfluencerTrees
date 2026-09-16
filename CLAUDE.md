# CLAUDE.md — InfluencerTrees

Conventions and decisions for this repo. Applies wherever you're working: Mac
terminal, VS Code, or Codespaces. Read before making changes.

**Status:** bootstrap applied in both workload accounts (2026-09-16). A push
to `main` builds `web/` once and deploys it to https://preview.influencertrees.com
(beta) and then https://influencertrees.com (prod) through
`.github/workflows/deploy.yml`. Every pull request gets its own preview at
`pr-<n>.preview.influencertrees.com` through `preview.yml`, removed on close.

This file is the short form — what was decided and what to follow. The longer
argument lives in [`docs/design/accounts-and-iac.md`](docs/design/accounts-and-iac.md).

_Last updated: 2026-09-16_

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
profile for anything that only reads. Works from Codespaces via the device-code
flow, so the iPad path is preserved.

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

## Decisions still open

Do not assume these. Raise them before writing code that depends on one.

| # | Decision | Notes |
|---|---|---|
| 1 | Mobile approach — Capacitor vs Expo/RN vs web-only | Interacts with the auth model; native shells handle cookies poorly |
| 2 | Backend shape — serverless vs containers vs managed | Previews favour scale-to-zero; the database sub-decision is hardest to reverse |

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
- **Auth model** (cookies vs bearer tokens) — pending #1 and #2, but the hardest
  thing here to change once users exist.

---

## Local setup

Required tooling: **AWS CLI v2, Terraform 1.10+, Node, `gh`**. On macOS:

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

---

## Commands

Every operation is a script in `scripts/` that runs identically on the Mac, in
Codespaces, and in CI. The workflow only sets up credentials and calls them.

| Command | Credentials | What it does |
|---|---|---|
| `scripts/check-infra.sh` | none | `terraform fmt -check` and `validate` on every root |
| `scripts/build-web.sh` | none | Builds `web/` into `dist/web`, stamped with the commit |
| `scripts/init-infra.sh <env>` | AWS | `terraform init` against the environment's state bucket; the others call it |
| `PLAN_ONLY=1 scripts/deploy-infra.sh <env>` | AWS | Plans the main infrastructure without changing anything |
| `scripts/deploy-infra.sh <env>` | AWS | Applies it. CI runs this for beta, then prod, on every push to `main` |
| `scripts/deploy-web.sh prod` | AWS | Syncs `dist/web` to the prod bucket root and invalidates CloudFront |
| `scripts/deploy-web.sh beta <folder>` | AWS | Same, into one folder of the beta bucket: `beta` is the stage, `pr-<n>` a preview |
| `scripts/remove-web.sh beta pr-<n>` | AWS | Deletes a preview folder. Refuses `beta` |

`<env>` is `beta` or `prod`. Laptop runs need `AWS_PROFILE=iad-tf-<env>`
exported plus two gitignored files in `infra/<env>/`: `backend.hcl` (state
bucket name) and `terraform.tfvars` (account ID). Both have `.example`
siblings. CI gets the same values from the repository variables
`TF_STATE_BUCKET_<ENV>`, `AWS_ACCOUNT_ID_<ENV>` and `AWS_DEPLOY_ROLE_ARN_<ENV>`,
kept there rather than in YAML because the repo is public and each contains
the account ID. Pull-request previews never run `terraform apply`; they only
write files into infrastructure the `main` deploy owns.

Bootstrap (`infra/bootstrap/<env>`) is separate and is only ever run by hand —
see `infra/bootstrap/README.md`.
