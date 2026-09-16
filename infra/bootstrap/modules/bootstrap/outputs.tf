output "account_id" {
  description = "Account this bootstrap was applied to. Check it before trusting the rest."
  value       = data.aws_caller_identity.current.account_id
}

output "state_bucket" {
  description = "S3 bucket for the main infrastructure's Terraform state."
  value       = aws_s3_bucket.state.id
}

output "deploy_role_arn" {
  description = "Role for GitHub Actions to assume. Goes in the workflow's configure-aws-credentials step."
  value       = aws_iam_role.deploy.arn
}

output "oidc_provider_arn" {
  description = "The GitHub OIDC identity provider registered in this account."
  value       = aws_iam_openid_connect_provider.github.arn
}

output "trusted_subjects" {
  description = "Exact sub claims permitted to assume the deploy role."
  value       = [for s in var.allowed_subjects : "repo:${var.github_repo}:${s}"]
}

output "app_role_path" {
  description = "IAM path every pipeline-created role must use."
  value       = local.app_role_path
}

output "permissions_boundary_arn" {
  description = "Boundary every pipeline-created role must carry. The deploy role cannot create a role without it."
  value       = aws_iam_policy.boundary.arn
}
