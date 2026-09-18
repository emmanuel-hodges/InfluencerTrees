terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  name = "inftrees-api-${var.environment}"

  # The bootstrap's boundary has a deterministic name, so its ARN is composed
  # here rather than read from the bootstrap's local state, which the pipeline
  # cannot reach. Must match aws_iam_policy.boundary in infra/bootstrap.
  permissions_boundary_arn = "arn:aws:iam::${var.account_id}:policy/inftrees-ci-boundary-${var.environment}"

  tags = {
    Project     = "InfluencerTrees"
    Environment = var.environment
    ManagedBy   = "terraform"
    Component   = "app"
  }
}

# ---------------------------------------------------------------------------
# Table
#
# One table for everything, on-demand. Items are addressed by pk/sk, and one
# overloaded index, gsi1, covers the other access patterns; the API owns the
# key layout. expiresAt lets short-lived rows such as login codes age out
# without a sweeper.
# ---------------------------------------------------------------------------

resource "aws_dynamodb_table" "app" {
  name         = "inftrees-app-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"
  tags         = local.tags

  # The data is the product. A wrong apply — a renamed table, a changed key —
  # must fail here, not delete and recreate. Turn this off deliberately, in
  # its own change, before any destroy.
  deletion_protection_enabled = true

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  attribute {
    name = "gsi1sk"
    type = "S"
  }

  global_secondary_index {
    name            = "gsi1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }
}

# Laptops and Codespaces use this table over SSO, so nothing local needs
# Docker or a DynamoDB emulator. Throwaway data: no backups, no protection.
resource "aws_dynamodb_table" "dev" {
  count = var.create_dev_table ? 1 : 0

  name         = "inftrees-app-dev"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"
  tags         = merge(local.tags, { Environment = "dev" })

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  attribute {
    name = "gsi1sk"
    type = "S"
  }

  global_secondary_index {
    name            = "gsi1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}

# ---------------------------------------------------------------------------
# Email
#
# One domain identity per account: beta sends as preview.influencertrees.com
# and prod as influencertrees.com, so neither can dent the other's
# reputation. DKIM is the authentication: SES signs with the domain's keys,
# the CNAMEs below publish the public halves, and that alignment is what
# DMARC checks. SPF is evaluated on amazonses.com's envelope sender and
# passes there; a custom MAIL FROM domain is a later step.
# ---------------------------------------------------------------------------

resource "aws_sesv2_configuration_set" "app" {
  configuration_set_name = "inftrees-${var.environment}"
  tags                   = local.tags

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }
}

# Sends, deliveries, bounces and complaints land in CloudWatch under one
# dimension, so a bad sending day shows on a graph rather than as silence.
resource "aws_sesv2_configuration_set_event_destination" "cloudwatch" {
  configuration_set_name = aws_sesv2_configuration_set.app.configuration_set_name
  event_destination_name = "cloudwatch"

  event_destination {
    enabled              = true
    matching_event_types = ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "REJECT"]

    cloud_watch_destination {
      dimension_configuration {
        dimension_name          = "configuration-set"
        dimension_value_source  = "MESSAGE_TAG"
        default_dimension_value = aws_sesv2_configuration_set.app.configuration_set_name
      }
    }
  }
}

resource "aws_sesv2_email_identity" "domain" {
  email_identity         = var.domain_name
  configuration_set_name = aws_sesv2_configuration_set.app.configuration_set_name
  tags                   = local.tags

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# SES hands back three selectors, and each needs a CNAME before the identity
# verifies, which can take up to 72 hours. scripts/check-ses.sh reports the
# status, and which hosted zone SES expects — see var.dkim_hosted_zone.
resource "aws_route53_record" "dkim" {
  count = 3

  zone_id = var.hosted_zone_id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.${var.dkim_hosted_zone}"]
}

# Start at none: receivers only report, nothing is quarantined. Add a rua=
# address to receive those reports, and tighten to quarantine, then reject,
# once they come back clean.
resource "aws_route53_record" "dmarc" {
  zone_id = var.hosted_zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=none"]
}

# ---------------------------------------------------------------------------
# Execution role
#
# The bootstrap contract: the deploy role may create a role only under
# /inftrees/ and only with the CI permissions boundary attached. Miss either
# and CreateRole is denied — that is the guard working. The boundary also
# caps this role, so nothing granted below can exceed it.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "api_trust" {
  statement {
    sid     = "LambdaAssume"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name                 = local.name
  path                 = "/inftrees/"
  permissions_boundary = local.permissions_boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.api_trust.json
  tags                 = local.tags
}

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Exactly what the running code needs, and nothing that reads the whole
# table: no Scan, so a bug or a stolen credential cannot dump every row in
# one call. The boundary would refuse Scan anyway; keeping it out of this
# policy makes the policy an honest statement of what the code does.
data "aws_iam_policy_document" "api" {
  statement {
    sid    = "AppTable"
    effect = "Allow"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:TransactGetItems",
      "dynamodb:TransactWriteItems",
      "dynamodb:ConditionCheckItem",
      "dynamodb:DescribeTable",
    ]

    resources = [
      aws_dynamodb_table.app.arn,
      "${aws_dynamodb_table.app.arn}/index/*",
    ]
  }

  # SES checks both ARNs on every send, so mail from any other identity or
  # outside the configuration set is refused.
  statement {
    sid     = "SendAsDomain"
    effect  = "Allow"
    actions = ["ses:SendEmail", "ses:SendRawEmail"]

    resources = [
      aws_sesv2_email_identity.domain.arn,
      aws_sesv2_configuration_set.app.arn,
    ]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "app-data-plane"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

# ---------------------------------------------------------------------------
# Function
# ---------------------------------------------------------------------------

# Created ahead of the function: Lambda would otherwise make the group on
# first invocation with no retention, and logs would accumulate forever.
resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.name}"
  retention_in_days = 30
  tags              = local.tags
}

resource "aws_lambda_function" "api" {
  function_name = local.name
  role          = aws_iam_role.api.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  memory_size   = 512
  timeout       = 10
  tags          = local.tags

  # The bundle scripts/build-api.sh produced. The hash is what makes a new
  # build a change; the path alone would not.
  filename         = var.api_zip_path
  source_code_hash = filebase64sha256(var.api_zip_path)

  logging_config {
    log_format = "JSON"
  }

  environment {
    variables = {
      TABLE_NAME            = aws_dynamodb_table.app.name
      STAGE                 = var.environment
      EMAIL_MODE            = "ses"
      SES_FROM              = "InfluencerTrees <no-reply@${var.domain_name}>"
      SES_CONFIGURATION_SET = aws_sesv2_configuration_set.app.configuration_set_name
      PUBLIC_BASE_URL       = var.public_base_url
      FOUNDER_EMAIL         = var.founder_email
      COOKIE_SECURE         = "true"
      BUILD_ENV             = var.environment
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.api,
    aws_iam_role_policy_attachment.api_logs,
  ]
}

# ---------------------------------------------------------------------------
# API
#
# An HTTP API in front of the function. No cors_configuration: browsers only
# ever reach this through CloudFront at /api/*, same-origin with the page,
# and a CORS block here would advertise the raw execute-api hostname as a
# second way in. That hostname stays reachable regardless — CloudFront is a
# convenience for the browser, not a security boundary — so nothing in the
# function may assume a request came through the distribution.
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "api" {
  name          = local.name
  protocol_type = "HTTP"
  tags          = local.tags
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

# Everything goes to the one function; the router lives in the code. The
# second route is identical, and exists only so the stage below can attach
# its own throttle to it — per-route settings need a route to name.
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "request_code" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /api/auth/request-code"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
  tags        = local.tags

  # Plenty for one founder and a handful of testers; low enough that a
  # runaway client cannot run up a bill.
  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 25
  }

  # The one public endpoint that sends email, rate-limited at the edge by
  # configuration, before any code runs. The limit is aggregate, not per
  # client: one request a second across everyone is plenty for logins and a
  # hard ceiling on how fast the domain can be made to send.
  route_settings {
    route_key              = "POST /api/auth/request-code"
    throttling_burst_limit = 5
    throttling_rate_limit  = 1
  }
}

resource "aws_lambda_permission" "apigateway" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
