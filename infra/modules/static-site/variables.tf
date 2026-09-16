variable "environment" {
  description = "Environment name, used in resource names. e.g. \"prod\"."
  type        = string
}

variable "domain_name" {
  description = "Primary domain the site is served on, e.g. influencertrees.com."
  type        = string
}

variable "alternate_names" {
  description = "Extra hostnames on the same certificate and distribution, e.g. [\"www.influencertrees.com\"]."
  type        = list(string)
  default     = []
}

variable "hosted_zone_id" {
  description = "Route 53 zone that holds every name above. Certificate validation and alias records go here."
  type        = string
}

variable "wildcard_prefix_routing" {
  description = <<-EOT
    Enables one distribution serving many hostnames. When set, *.<domain_name>
    is added to the certificate, the aliases and DNS; each request is routed
    to the bucket folder named after its first hostname label; and requests to
    the bare domain go to the folder named here, e.g. "beta". Leave null for a
    single-site environment that syncs to the bucket root.
  EOT
  type        = string
  default     = null
}
