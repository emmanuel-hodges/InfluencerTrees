# Bootstrap

The small set of resources that must exist **before** CI can run, created once
per workload account from a laptop.

## Why this exists

CI authenticates to AWS by assuming an IAM role. That role, and the OIDC
provider that vouches for GitHub's tokens, would normally be created by
Terraform — but Terraform is run by CI, which cannot authenticate until the role
exists. Something has to break the circle from outside.

That is all this is. It runs twice, ever.

Not to be confused with `cdk bootstrap`, which is CDK's own unrelated
prerequisite stack and applies only to the sandbox accounts.

## What it creates, per account

| Resource | Purpose |
|---|---|
| **S3 state bucket** | Where the *main* infrastructure keeps Terraform state. Versioned, encrypted, public access blocked, non-TLS requests denied. |
| **GitHub OIDC provider** | Registers `token.actions.githubusercontent.com` as an identity provider AWS will trust. |
| **Deploy role** | What GitHub Actions assumes. Trust policy pinned to this repository and the refs allowed for that environment. |

## Why local state

The bootstrap creates the state bucket, so it cannot store its own state in it.
State lives in `beta/terraform.tfstate` and `prod/terraform.tfstate`, gitignored.

If you lose those files nothing is broken — there are four resources, and
`terraform import` recovers them. That is a better trade than the recursion of
migrating the bootstrap's state into a bucket the bootstrap manages.

## Running it

Each environment is its own directory with its own state. Start with `beta`.

```bash
cd infra/bootstrap/beta
cp terraform.tfvars.example terraform.tfvars
```

Fill in `account_id` and `state_bucket_name` — bucket names are globally unique
across all of AWS, so include the account ID. Then:

```bash
aws sso login --profile iad-tf-beta
terraform init
terraform plan
```

**Read the plan.** It should create exactly seven resources and modify nothing.
Then `terraform apply`, and repeat in `prod` with the prod profile.

### The guard

Each root config sets `allowed_account_ids`. If the profile resolves to any
other account, Terraform refuses before touching anything. With five accounts in
the organization, that is the difference between a typo and an incident.

## The security-relevant part

The trust policy is the whole point, so it is worth reading rather than
trusting:

```
repo:emmanuel-hodges/InfluencerTrees:ref:refs/heads/main   prod
repo:emmanuel-hodges/InfluencerTrees:*                     beta
```

Two conditions matter, and both are the documented ways people get this wrong:

- **`aud` is pinned** to `sts.amazonaws.com`. Without it, a token minted for a
  different audience satisfies the policy.
- **The repository portion is literal.** `repo:OWNER/*` would let any repository
  in the account assume the role. Only the ref varies, and only for beta —
  production accepts one branch.

The role also carries explicit denies on privilege escalation: it cannot create
IAM users or access keys, touch Organizations or Identity Center, or modify its
own trust policy or the OIDC provider that admits it.

## Known looseness

`ApplicationInfrastructure` grants service-level wildcards (`s3:*`,
`cloudfront:*`, `lambda:*`) because the resource set is not known yet. The
account boundary is the primary control; this policy is the secondary one.

Tighten it to specific ARNs once the hello-world is deployed and the real
resource names exist. Until then, treat the blast radius as "everything in this
one account", which is what the account structure was chosen to contain.
