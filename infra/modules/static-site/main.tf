terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  # Bucket names are global across AWS, so the account ID keeps this unique
  # without putting the ID in the repo.
  bucket_name = "inftrees-web-${var.environment}-${data.aws_caller_identity.current.account_id}"

  # With prefix routing on, the wildcard joins the certificate, the aliases
  # and the DNS records, so any label under the domain resolves and is served.
  prefix_routing = var.wildcard_prefix_routing != null
  wildcard_names = local.prefix_routing ? ["*.${var.domain_name}"] : []
  all_names      = concat([var.domain_name], var.alternate_names, local.wildcard_names)

  tags = {
    Project     = "InfluencerTrees"
    Environment = var.environment
    ManagedBy   = "terraform"
    Component   = "static-site"
  }
}

# ---------------------------------------------------------------------------
# Site bucket
#
# Private. Nothing reads it directly; CloudFront fetches from it using an
# origin access control, and the bucket policy admits only that distribution.
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "web" {
  bucket = local.bucket_name
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

data "aws_iam_policy_document" "web_bucket" {
  statement {
    sid    = "AllowCloudFrontRead"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    # Without this, any CloudFront distribution in any account could read the
    # bucket by pointing at it as an origin.
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.web]
}

# ---------------------------------------------------------------------------
# Certificate
#
# CloudFront only accepts certificates from us-east-1, which is where this
# whole stack lives anyway. Validation is by DNS: ACM hands back one CNAME
# per name, we create them in the zone, ACM sees them and issues.
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "site" {
  domain_name               = var.domain_name
  subject_alternative_names = concat(var.alternate_names, local.wildcard_names)
  validation_method         = "DNS"
  tags                      = local.tags

  # A replacement certificate must exist before the old one is detached from
  # the distribution, or the site drops TLS during the swap.
  lifecycle {
    create_before_destroy = true
  }
}

# A wildcard and its base name validate with the same record, and ACM lists
# both. Creating it twice makes Terraform fight itself, so the wildcard entry
# is skipped whenever its base name is also on the certificate.
locals {
  cert_names = [for dvo in aws_acm_certificate.site.domain_validation_options : dvo.domain_name]
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.site.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
    if !(startswith(dvo.domain_name, "*.") && contains(local.cert_names, trimprefix(dvo.domain_name, "*.")))
  }

  zone_id         = var.hosted_zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

# Blocks until ACM reports the certificate issued, so the distribution below
# never references a pending certificate.
resource "aws_acm_certificate_validation" "site" {
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# ---------------------------------------------------------------------------
# CloudFront
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "inftrees-web-${var.environment}"
  description                       = "Signs CloudFront's requests to the ${var.environment} site bucket."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host_header" {
  name = "Managed-AllViewerExceptHostHeader"
}

# Viewer-request function on the default behaviour in every environment. It
# sends client-side routes such as /login to index.html and, with prefix
# routing on, rewrites each request's path to the folder named after the
# first hostname label: pr-12.preview.example.com/x becomes /pr-12/x in the
# bucket, and the bare domain maps to var.wildcard_prefix_routing.
#
# Not custom_error_response: that is distribution-wide, so it would turn the
# API's 401 and 404 JSON into index.html with a 200, and it cannot follow the
# per-folder layout.
resource "aws_cloudfront_function" "viewer_request" {
  name    = "inftrees-web-${var.environment}-viewer-request"
  comment = local.prefix_routing ? "Client-side routes to index.html; each hostname under ${var.domain_name} to its own folder." : "Client-side routes to index.html."
  runtime = "cloudfront-js-2.0"
  publish = true

  code = templatefile("${path.module}/viewer-request.js.tftpl", {
    domain_name    = var.domain_name
    default_prefix = local.prefix_routing ? var.wildcard_prefix_routing : ""
    prefix_routing = local.prefix_routing
  })
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "InfluencerTrees ${var.environment}"
  default_root_object = "index.html"
  aliases             = local.all_names
  price_class         = "PriceClass_100" # North America and Europe edges only
  http_version        = "http2and3"
  tags                = local.tags

  origin {
    origin_id                = "s3-web"
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  # The API rides the same distribution so the browser sees one origin: the
  # session cookie set under /api/* is first-party, and there is no CORS.
  dynamic "origin" {
    for_each = var.api_origin_domain_name != null ? [var.api_origin_domain_name] : []

    content {
      origin_id   = "api"
      domain_name = origin.value

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3-web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.viewer_request.arn
    }
  }

  # Nothing under /api/* is cached. AllViewerExceptHostHeader forwards every
  # viewer header, cookie and query string — the session cookie and any
  # Authorization header included — but lets API Gateway see its own hostname,
  # which it insists on. Behaviours own their function associations, so the
  # router above never sees /api. https-only rather than a redirect: a
  # redirected POST would arrive as a GET.
  dynamic "ordered_cache_behavior" {
    for_each = var.api_origin_domain_name != null ? ["/api/*"] : []

    content {
      path_pattern             = ordered_cache_behavior.value
      target_origin_id         = "api"
      viewer_protocol_policy   = "https-only"
      allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods           = ["GET", "HEAD"]
      compress                 = true
      cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host_header.id
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ---------------------------------------------------------------------------
# DNS
#
# The apex cannot be a CNAME, so every name is a Route 53 alias record, which
# resolves to CloudFront's addresses at query time. One A and one AAAA each.
# ---------------------------------------------------------------------------

resource "aws_route53_record" "a" {
  for_each = toset(local.all_names)

  zone_id = var.hosted_zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "aaaa" {
  for_each = toset(local.all_names)

  zone_id = var.hosted_zone_id
  name    = each.value
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}
