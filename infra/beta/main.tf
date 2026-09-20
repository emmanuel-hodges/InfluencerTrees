terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # State lives in the bucket the beta bootstrap created. The bucket name
  # carries the account ID, so it is supplied at init time (-backend-config)
  # rather than written here — see scripts/init-infra.sh.
  backend "s3" {
    key          = "beta/site.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true # native S3 locking; no DynamoDB table
  }
}

provider "aws" {
  region = "us-east-1"

  # Refuses to run if the credentials belong to any other account. In CI the
  # deploy role can only ever be beta's; on a laptop this catches a wrong
  # AWS_PROFILE before anything is touched.
  allowed_account_ids = [var.account_id]
}

# ---------------------------------------------------------------------------
# Delegated zone
#
# The apex zone lives in prod, and beta must never hold write access to it.
# Instead prod delegates this subtree here with a single NS record (see
# infra/prod/delegations.tf), and every record beta needs — certificate
# validation, aliases, per-branch names — is written into this zone. The NS
# record in prod has to exist before the certificate below can validate, so
# the first apply is done in two steps; see infra/beta/README.md.
# ---------------------------------------------------------------------------

resource "aws_route53_zone" "preview" {
  name    = var.domain_name
  comment = "Delegated from the apex zone in prod. Owned by beta; serves the beta stage and per-branch previews."

  tags = {
    Project     = "InfluencerTrees"
    Environment = "beta"
    ManagedBy   = "terraform"
    Component   = "dns"
  }
}

# ---------------------------------------------------------------------------
# Application
#
# Previews share this backend. A pull request's preview is a folder of static
# files in the site bucket; its /api/* requests go through the same
# distribution to the same function, table and sending identity as the beta
# stage. So a preview exercises the API last deployed to beta, not the one
# on its own branch, and it shares beta's data. inftrees-app-dev is the
# separate table laptops and Codespaces use over SSO.
# ---------------------------------------------------------------------------

module "app" {
  source = "../modules/app"

  environment      = "beta"
  account_id       = var.account_id
  domain_name      = var.domain_name
  hosted_zone_id   = aws_route53_zone.preview.zone_id
  api_zip_path     = var.api_zip_path
  founder_email    = var.founder_email
  public_base_url  = "https://${var.domain_name}"
  create_dev_table = true

  # Bounces and complaints email the support inbox; the deploy role gained
  # sns:* in the bootstrap on 2026-09-20. The inbox confirms the subscription
  # once (the "AWS Notification - Subscription Confirmation" email).
  bounce_notification_email = "influencertrees-support@pm.me"
  dkim_hosted_zone          = var.dkim_hosted_zone
}

# One bucket and one distribution serve every hostname under the domain.
# preview.influencertrees.com is the beta stage (folder "beta"); anything
# else, e.g. pr-12.preview.influencertrees.com, is the folder of that name.
# /api/* on any of them is the application above.
module "site" {
  source = "../modules/static-site"

  environment             = "beta"
  domain_name             = var.domain_name
  hosted_zone_id          = aws_route53_zone.preview.zone_id
  wildcard_prefix_routing = "beta"
  api_origin_domain_name  = module.app.api_origin_domain_name
}
