variable "environment" {
  description = "Environment name, used in resource names. e.g. \"beta\", \"prod\"."
  type        = string
}

variable "account_id" {
  description = "Account the module is applied to. Composes the permissions boundary ARN the bootstrap contract requires on every role."
  type        = string
}

variable "domain_name" {
  description = "Domain the API sends mail as: preview.influencertrees.com in beta, influencertrees.com in prod. Becomes the SES identity; DKIM and DMARC records hang off it."
  type        = string
}

variable "hosted_zone_id" {
  description = "Route 53 zone that holds domain_name. The DKIM and DMARC records go here."
  type        = string
}

variable "api_zip_path" {
  description = "Path of the built Lambda bundle, produced by scripts/build-api.sh and passed through by scripts/deploy-infra.sh."
  type        = string
}

variable "founder_email" {
  description = "The founder's login address, handed to the API as FOUNDER_EMAIL. Personal data: arrives as a variable, never in the repo."
  type        = string
  default     = ""
}

variable "public_base_url" {
  description = "Origin the site is served from, e.g. https://preview.influencertrees.com. The API builds the links in its email from it."
  type        = string
}

variable "create_dev_table" {
  description = "Also create inftrees-app-dev, the table laptops and Codespaces use over SSO. Beta only."
  type        = bool
  default     = false
}

variable "dkim_hosted_zone" {
  description = <<-EOT
    Hosted zone the three DKIM CNAMEs point at. Normally dkim.amazonses.com,
    but SES may return an identity-specific SigningHostedZone, in which case
    the records must point there instead or DKIM never verifies.
    scripts/check-ses.sh reports the zone SES expects; set this to it and
    apply again.
  EOT
  type        = string
  default     = "dkim.amazonses.com"
}
