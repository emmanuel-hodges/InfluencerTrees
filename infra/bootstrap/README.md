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
| **Permissions boundary** | A ceiling applied to every role the pipeline creates. Closes the create-a-role-and-attach-admin escalation path. |

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

**Read the plan.** It should create exactly nine resources and modify nothing.
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
IAM users or access keys, touch Organizations or Identity Center, strip or swap
a permissions boundary, or modify its own trust policy, the OIDC provider that
admits it, or the boundary policy.

## How the escalation path is closed

The pipeline must create IAM roles — Lambdas need execution roles. Unconstrained,
that is the whole game: create a role, attach `AdministratorAccess`, pass it to
a Lambda you control.

Three things together prevent it:

1. **`iam:CreateRole`, `AttachRolePolicy` and `PutRolePolicy` are permitted only
   on roles under `/inftrees/`, and only when the role carries the permissions
   boundary.** There is no other statement allowing them, so a role without the
   boundary simply cannot be created.
2. **The boundary itself** permits the same application services the pipeline
   has — S3, CloudFront, Lambda, API Gateway, logs — and no IAM. A boundary-capped
   role cannot exceed that regardless of what is attached to it.
3. **`iam:PassRole` is scoped to `/inftrees/*`**, so the only roles the pipeline
   can hand to a service are ones it created under the boundary.

The deploy role is explicitly denied `DeleteRolePermissionsBoundary`,
`PutRolePermissionsBoundary`, and every edit to the boundary policy, so it cannot
remove the cap after the fact.

### The contract for the main infrastructure

Every `aws_iam_role` it creates must set both:

```hcl
path                 = "/inftrees/"
permissions_boundary = <permissions_boundary_arn output of this bootstrap>
```

Miss either and the apply fails with `AccessDenied` on `CreateRole`. That is the
guard working, not a bug.

## Known looseness

`ApplicationInfrastructure` grants service-level wildcards (`s3:*`,
`cloudfront:*`, `lambda:*`) because the resource set is not known yet. The
account boundary is the primary control; this policy is the secondary one.
Tighten to specific ARNs once the hello-world exists and real names are known.
