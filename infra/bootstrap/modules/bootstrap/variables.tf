variable "environment" {
  description = "Environment name, used in resource names. e.g. \"beta\", \"prod\"."
  type        = string
}

variable "github_repo" {
  description = <<-EOT
    The repository portion of the OIDC sub claim, pinned EXACTLY in the trust
    policy. Case-sensitive.

    Repositories with GitHub's immutable subject claim enabled (the default for
    new repositories) mint "owner@OWNER_ID/repo@REPO_ID", which survives
    renames and cannot be reclaimed by re-creating a deleted repository. Older
    repositories mint plain "owner/repo". Read the exact value rather than
    guessing:

      gh api repos/OWNER/REPO/actions/oidc/customization/sub --jq .sub_claim_prefix

    and drop the leading "repo:".
  EOT
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._-]+(@[0-9]+)?/[A-Za-z0-9._-]+(@[0-9]+)?$", var.github_repo))
    error_message = "github_repo must be owner/repo or owner@ID/repo@ID, with no protocol, .git suffix, or leading repo:."
  }
}

variable "allowed_subjects" {
  description = <<-EOT
    Subject patterns permitted to assume the deploy role. Each is appended to
    "repo:<owner>/<repo>:" to form the full sub claim.

      Production:     ["ref:refs/heads/main"]  — exactly one branch.
      Pre-production: ["*"]                    — any branch or pull request,
                                                 which is what makes per-branch
                                                 preview deploys work.

    The repository portion is always exact. NEVER wildcard it: a sub condition
    like "repo:OWNER/*" lets any repository in the account assume this role.
  EOT
  type        = list(string)

  validation {
    condition     = length(var.allowed_subjects) > 0
    error_message = "At least one subject pattern is required."
  }
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name for this account's Terraform state."
  type        = string
}
