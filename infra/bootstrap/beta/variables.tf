variable "aws_profile" {
  description = "SSO profile to apply with. Must resolve to account_id below."
  type        = string
}

variable "account_id" {
  description = "Expected AWS account ID. Terraform refuses to run against any other."
  type        = string
}

variable "github_repo" {
  description = "owner/repo, exactly as GitHub renders it."
  type        = string
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name for this account's Terraform state."
  type        = string
}

variable "allowed_subjects" {
  description = "OIDC sub patterns, appended to repo:<owner>/<repo>:"
  type        = list(string)
}
