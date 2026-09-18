output "api_origin_domain_name" {
  description = "The API Gateway hostname without scheme, for CloudFront to use as an origin."
  value       = replace(aws_apigatewayv2_api.api.api_endpoint, "https://", "")
}

output "api_endpoint" {
  description = "The API's own URL. Reachable directly; the browser uses /api/* on the site instead."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "table_name" {
  description = "The environment's table, which the function reads and writes."
  value       = aws_dynamodb_table.app.name
}

output "dev_table_name" {
  description = "The shared development table; null unless create_dev_table is set."
  value       = one(aws_dynamodb_table.dev[*].name)
}

output "lambda_function_name" {
  description = "Function to tail logs for."
  value       = aws_lambda_function.api.function_name
}

output "ses_identity" {
  description = "The SES domain identity. scripts/check-ses.sh reads this."
  value       = var.domain_name
}

output "ses_configuration_set" {
  description = "Configuration set every send goes through; its name is the CloudWatch dimension."
  value       = aws_sesv2_configuration_set.app.configuration_set_name
}
