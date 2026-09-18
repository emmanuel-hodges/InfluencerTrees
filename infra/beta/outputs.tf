output "web_bucket" { value = module.site.web_bucket }
output "cloudfront_distribution_id" { value = module.site.cloudfront_distribution_id }
output "cloudfront_domain_name" { value = module.site.cloudfront_domain_name }
output "site_url" { value = module.site.site_url }
output "domain_name" { value = module.site.domain_name }
output "default_prefix" { value = module.site.default_prefix }

output "api_origin_domain_name" { value = module.app.api_origin_domain_name }
output "api_endpoint" { value = module.app.api_endpoint }
output "table_name" { value = module.app.table_name }
output "dev_table_name" { value = module.app.dev_table_name }
output "lambda_function_name" { value = module.app.lambda_function_name }
output "ses_identity" { value = module.app.ses_identity }

output "preview_zone_name_servers" {
  description = "Paste into infra/prod/delegations.tf so the apex zone delegates the subtree here."
  value       = aws_route53_zone.preview.name_servers
}
