variable "account_id" {
  description = "Expected AWS account ID. Terraform refuses to run against any other. TF_VAR_account_id in CI, terraform.tfvars locally."
  type        = string
}

variable "domain_name" {
  description = "Apex domain served by this environment."
  type        = string
  default     = "influencertrees.com"
}
