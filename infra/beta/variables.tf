variable "account_id" {
  description = "Expected AWS account ID. Terraform refuses to run against any other. TF_VAR_account_id in CI, terraform.tfvars locally."
  type        = string
}

variable "domain_name" {
  description = "Subtree delegated to this account. The beta stage is served here; previews are served one label below it."
  type        = string
  default     = "preview.influencertrees.com"
}

variable "api_zip_path" {
  description = "Absolute path of the built Lambda bundle. Set by scripts/deploy-infra.sh as TF_VAR_api_zip_path; never written to tfvars."
  type        = string
}

variable "founder_email" {
  description = <<-EOT
    The founder's login address, given to the API so it knows which account
    administers the site. TF_VAR_founder_email in CI, from the FOUNDER_EMAIL
    repository variable; terraform.tfvars on a laptop. Personal data: never
    in the repo.
  EOT
  type        = string
  default     = ""
}

variable "dkim_hosted_zone" {
  description = "Hosted zone the DKIM CNAMEs point at. SES occasionally assigns an identity-specific one; scripts/check-ses.sh reports it."
  type        = string
  default     = "dkim.amazonses.com"
}
