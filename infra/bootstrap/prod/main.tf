terraform {
  required_version = ">= 1.10"

  # Local state on purpose. The bootstrap creates the state bucket, so it
  # cannot store its own state there. See ../README.md.
  backend "local" {}
}

provider "aws" {
  region  = "us-east-1"
  profile = var.aws_profile

  # Refuses to run if the profile points somewhere unexpected. With five
  # accounts, this is the guard against applying to the wrong one.
  allowed_account_ids = [var.account_id]
}

module "bootstrap" {
  source = "../modules/bootstrap"

  environment       = "prod"
  github_repo       = var.github_repo
  state_bucket_name = var.state_bucket_name
  allowed_subjects  = var.allowed_subjects
}

output "account_id" { value = module.bootstrap.account_id }
output "state_bucket" { value = module.bootstrap.state_bucket }
output "deploy_role_arn" { value = module.bootstrap.deploy_role_arn }
output "oidc_provider_arn" { value = module.bootstrap.oidc_provider_arn }
output "trusted_subjects" { value = module.bootstrap.trusted_subjects }
output "app_role_path" { value = module.bootstrap.app_role_path }
output "permissions_boundary_arn" { value = module.bootstrap.permissions_boundary_arn }
