# Account structure and infrastructure-as-code

**Status:** Decided — 2026-09-12
**Settles:** CI host, and the infrastructure-as-code choice
**Still open:** mobile approach, backend shape

---

## Context

InfluencerTrees needs somewhere to run, a way to deploy, and a structure that
does not have to be unpicked later. Two considerations shaped this:

1. **Blast radius.** A compromised or misconfigured CI pipeline must not be able
   to reach production.
2. **Grounded tool choice.** Terraform and AWS CDK are both credible, and the
   difference between them is easier to judge from use than from reading. The
   structure below creates room to evaluate CDK.

---

## Decision: one organization, two OUs, five accounts

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

Primary region `us-east-1` throughout.

### Why the account boundary

The separation between environments is an **account** boundary, not an IAM
policy. Crossing it requires a role in the *target* account that explicitly
trusts the caller. A misconfigured trust policy, an over-broad permission, or a
compromised preview role cannot reach production, because the failure mode of
account isolation is closed rather than open.

Organizations, member accounts, and IAM Identity Center are all free. The
structure costs nothing but setup time.

### Why the sandbox needs two accounts, not one

`cdk bootstrap --trust` — the mechanism by which a CDK pipeline deploys across
accounts — only means anything when there is a real boundary to cross. A single
sandbox account would exercise CDK syntax but not the cross-account trust model,
which is one of only two things genuinely exclusive to CDK Pipelines (the other
being pipeline self-mutation). Evaluating CDK without those two is evaluating
something other than what CDK is for.

### Why one organization, not two

Two organizations were considered and rejected. They would have meant:

- Two management accounts to secure, with two root users and two billing
  relationships
- **Two IAM Identity Center instances** — one per organization — so two SSO
  configurations and two sets of profiles, daily
- No consolidated billing across the six accounts
- A pattern that is not used in practice and would not transfer

And no isolation gained: member accounts cannot reach each other regardless of
which OU or organization they sit in. The boundary is the account.

### What OUs buy us

Service Control Policies attach to an OU and constrain every account beneath it.
An SCP sets a **ceiling**, never a grant — effective permissions are what IAM
allows intersected with what the SCP permits, so even `AdministratorAccess`
cannot exceed it. That makes it a structural boundary rather than a rule someone
has to remember.

The Sandbox OU should carry one that:

- denies every region except `us-east-1`
- denies expensive service families
- caps what experimentation can ever cost

Note that SCPs do **not** apply to the management account, even when attached to
the organization root — a further reason it holds no workloads.

This shape is close to what AWS Control Tower generates, so it is the standard
pattern rather than a bespoke one.

### Naming

`beta` and `gamma` follow Amazon's convention: alpha → beta → gamma → prod,
where **gamma is the pre-production stage kept as production-like as possible**.
Naming the sandbox's production stand-in `gamma` is therefore semantically
exact, not just a label.

Name parts: `iad` is the airport code for `us-east-1`; `sbx` marks a sandbox
account so the danger is legible at a glance; `trycdk` says why it exists. The
management account carries no region marker because Organizations is global.
Prefixes are kept distinct so it is never ambiguous which account you are
operating in.

---

## Decision: Terraform for production, CDK in the sandbox

Not "Terraform or CDK." Both, with defined roles.

| | Tool | Purpose |
|---|---|---|
| `inftrees-iad-tf-beta`, `inftrees-iad-tf-prod` | **Terraform** | Real infrastructure serving customers |
| `inftrees-iad-sbx-trycdk-beta`, `inftrees-iad-sbx-trycdk-gamma` | **CDK** | Development, deliberately decoupled |

### Reasoning

**Terraform for the real thing.** It talks directly to the AWS APIs rather than
compiling to CloudFormation, which avoids CFN's reputed slower deploys,
stuck-stack failure modes (`UPDATE_ROLLBACK_FAILED` requiring manual
intervention), and its past lag behind newly released AWS features.
`terraform plan` reports changes at the
resource level; `cdk diff` reports a diff of generated CloudFormation templates,
one layer removed from what will actually happen. Wider adoption also means a
larger module ecosystem and more engineers who can pick the codebase up.

**CDK in the sandbox.** It is AWS's own tool, so it tracks new services early
and is what AWS reference architectures use. Two of its properties are worth
first-hand evaluation rather than assessment from documentation: cross-account
trust via `cdk bootstrap --trust`, and self-mutating pipelines. Its unit-testing
story is also genuinely stronger — `aws-cdk-lib/assertions` runs under Jest with
no AWS calls, because CDK is ordinary TypeScript.

### What was rejected: a maintained mirror

An earlier proposal had the CDK accounts mirroring production continuously, with
the same application deploying to all four.

Rejected because:

- Every infrastructure change would have to be made twice, in two languages —
  and early on, infrastructure changes are frequent.
- **Drift is inevitable.** The first production incident gets fixed in Terraform
  and not mirrored, correctly. Repeat a few times and the CDK side is a stale
  approximation, at which point maintaining it becomes reconciliation work
  rather than a fair assessment of CDK's costs and benefits.
- A shared pipeline would let a sandbox failure block a customer-facing deploy.

**The sandbox is therefore decoupled by design.** It is not a mirror and carries
no obligation to stay current. Its pipelines must never be able to block a real
deploy.

### Trade-offs accepted

- Two toolchains to stay fluent in.
- CDK exposure is sandbox-scale. Conclusions drawn from it about operating CDK
  at production scale should be held loosely.
- `cdk bootstrap` and this project's own OIDC bootstrap are different things
  with confusingly similar names. See below.

### Licence: BSL 1.1, and why it is not a constraint

Terraform 1.6.0 and later are published under the Business Source License 1.1 —
source-available, not open source. Production use is prohibited by default, then
granted back by an Additional Use Grant. Ours sits inside it.

The grant forbids one thing: offering Terraform to third parties in competition
with IBM's paid versions. HashiCorp's licensing FAQ, which the licence names as
binding interpretive guidance, states that a "competitive offering" must be sold
to third parties *and* significantly overlap the capabilities of the paid
product, and that hosting the product for internal use within an organization is
permitted. Running `terraform apply` against our own accounts is internal use.
Running it from GitHub Actions still is — the runner is a rented machine, not a
third party.

No fee, no registration, no notice obligation. The "conspicuously display this
License" clause binds copies of Terraform that are *distributed*, and we
distribute none. Providers are unaffected: HashiCorp's own providers, the plugin
SDK, and the Framework remain MPL 2.0, `hashicorp/aws` included.

**The line not to cross.** FAQ 14 treats a service that lets *customers* invoke
Terraform as embedding it, including through a bring-your-own-container
mechanism. The realistic version here would be a paid tier that provisions
infrastructure inside a customer's own AWS account. That is the only plausible
roadmap item that puts this back in play, and it would need a proper legal read
rather than a reasoned-through one.

**The downside is bounded.** The licence applies separately to each version and
changes are not retroactive, so any future narrowing of the grant reaches only
later releases. Worst case is pinning a version, not a bill. Versions also
convert to MPL 2.0 four years after publication — 1.6.0 converts 2027-10-04.

**Keep the exit free.** OpenTofu — the MPL 2.0 fork, under the Linux Foundation
and in the CNCF — reads the same HCL, uses the same providers, and writes the
same state format. Everything decided here runs unchanged under `tofu`, including
S3 native locking via `use_lockfile`, supported from OpenTofu 1.10. That
portability costs nothing today and stays free unless we adopt a Terraform-only
feature — Stacks, or HCP Terraform-hosted state and workflows. Adopting one is a
decision to make deliberately, not a default to drift into.

---

## Decision: GitHub Actions as CI host

Chosen over AWS CodePipeline/CodeBuild and GitLab CI.

- GitHub-hosted **macOS runners** keep signed iOS builds in the same system as
  the web deploys. CodeBuild's macOS support requires dedicated hosts on a
  24-hour minimum billing commitment, which would have forced a separate mobile
  CI vendor.
- Per-branch previews are a one-line trigger, and the PR page is a good surface
  for reviewing them from a phone.
- Config lives in the repo, so it is editable from any environment including
  Codespaces.

**Cost accepted:** GitHub becomes a party that can mint short-lived AWS
credentials. Mitigated by the CI conventions in `CLAUDE.md` — SHA-pinned actions,
minimal workflow permissions, and an unprivileged build separated from a
privileged deploy — not eliminated.

The sandbox may later grow a **CDK Pipelines** deployment, which would run
CodePipeline inside AWS and remove the external-credential-issuer property
entirely. That is the AWS-native pattern and worth understanding first-hand, but
it does not do per-branch previews, so it complements GitHub Actions rather than
replacing it.

---

## Two kinds of bootstrap

These are different, and the name collision causes confusion.

| | What it is | When |
|---|---|---|
| `cdk bootstrap` | CDK's own prerequisite stack — staging bucket, ECR repo, deployment roles. Run per account/region, with `--trust` for cross-account. | Sandbox accounts only |
| **Our bootstrap** | Breaks the CI chicken-and-egg: the GitHub OIDC provider, the Terraform state bucket, and the scoped deploy roles. Run once per account from a laptop with SSO credentials. | Workload accounts |

The circularity our bootstrap solves: CI needs an IAM role to authenticate; the
role would normally be created by Terraform; Terraform is run by CI. Something
must create the first pieces outside CI.

Note that CDK has no state file — CloudFormation tracks state server-side — so
the state bucket applies only to the Terraform side.

---

## Consequences

**Costs**

- Route 53 hosted zones at $0.50/month each.
- Root credentials to secure with MFA on every account, or removed entirely via
  centralized root access management.
- One unique root email address per account (`+` aliasing works).
- New organizations often start with an account quota around four. Five accounts
  may require a support request — file it early.
- Account closure takes 90 days and ties up the root email. Name accounts
  correctly the first time.

**Deliberately deferred**

- SCP on the Sandbox OU — worth writing, not a launch blocker.
- CDK Pipelines in the sandbox — after the real pipeline ships.
- Any fourth "tooling" account for a pipeline — not needed while CI is GitHub
  Actions.

---

## Still open

| Decision | Notes |
|---|---|
| Mobile approach — Capacitor vs Expo/React Native vs web-only | Interacts with the auth model. Native shells handle cookies poorly, so bearer tokens are likely required. |
| Backend shape — serverless vs containers vs managed | Preview environments favour scale-to-zero. Database choice is the sub-decision that is hardest to reverse. |

Neither blocks account creation or the bootstrap.
