output "web_bucket" {
  description = "Bucket the built site is synced into."
  value       = aws_s3_bucket.web.id
}

output "cloudfront_distribution_id" {
  description = "Distribution to invalidate after a sync."
  value       = aws_cloudfront_distribution.web.id
}

output "cloudfront_domain_name" {
  description = "The distribution's own hostname; the DNS alias records point here."
  value       = aws_cloudfront_distribution.web.domain_name
}

output "site_url" {
  description = "Where the site is served."
  value       = "https://${var.domain_name}"
}

output "domain_name" {
  description = "Primary hostname. With prefix routing, <prefix>.<domain_name> serves the folder <prefix>."
  value       = var.domain_name
}

output "default_prefix" {
  description = "Folder served on the bare domain when prefix routing is on; null otherwise."
  value       = var.wildcard_prefix_routing
}
