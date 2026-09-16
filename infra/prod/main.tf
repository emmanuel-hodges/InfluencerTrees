terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # State lives in the bucket the bootstrap created. The bucket name carries
  # the account ID, so it is supplied at init time (-backend-config) rather
  # than written here — see scripts/deploy-infra.sh.
  backend "s3" {
    key          = "prod/site.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true # native S3 locking; no DynamoDB table
  }
}

provider "aws" {
  region = "us-east-1"

  # Refuses to run if the credentials belong to any other account. In CI the
  # deploy role can only ever be prod's; on a laptop this catches a wrong
  # AWS_PROFILE before anything is touched.
  allowed_account_ids = [var.account_id]
}

data "aws_route53_zone" "site" {
  name = var.domain_name
}

module "site" {
  source = "../modules/static-site"

  environment     = "prod"
  domain_name     = var.domain_name
  alternate_names = ["www.${var.domain_name}"]
  hosted_zone_id  = data.aws_route53_zone.site.zone_id
}
