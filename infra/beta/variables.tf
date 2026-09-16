variable "account_id" {
  description = "Expected AWS account ID. Terraform refuses to run against any other. TF_VAR_account_id in CI, terraform.tfvars locally."
  type        = string
}

variable "domain_name" {
  description = "Subtree delegated to this account. The beta stage is served here; previews are served one label below it."
  type        = string
  default     = "preview.influencertrees.com"
}
