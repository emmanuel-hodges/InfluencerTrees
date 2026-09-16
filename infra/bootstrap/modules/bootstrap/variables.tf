variable "environment" {
  description = "Environment name, used in resource names. e.g. \"beta\", \"prod\"."
  type        = string
}

variable "github_repo" {
  description = <<-EOT
    GitHub repository as owner/repo. Pinned EXACTLY in the OIDC trust policy,
    capitalisation included — the sub claim GitHub mints is case-sensitive.
  EOT
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$", var.github_repo))
    error_message = "github_repo must be in owner/repo form, with no protocol or .git suffix."
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
