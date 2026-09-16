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
