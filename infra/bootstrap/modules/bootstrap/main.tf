terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  role_name = "github-actions-deploy-${var.environment}"

  # Built by hand rather than referencing aws_iam_role.deploy.arn, which would
  # create a dependency cycle: the role's policy cannot reference the role.
  role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.role_name}"

  tags = {
    Project     = "InfluencerTrees"
    Environment = var.environment
    ManagedBy   = "terraform"
    Component   = "bootstrap"
  }
}

# ---------------------------------------------------------------------------
# Terraform state bucket
#
# This holds state for the MAIN infrastructure, not for the bootstrap itself.
# The bootstrap keeps local state — it cannot store state in a bucket it has
# not created yet. See README.md.
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name
  tags   = local.tags

  # Losing state means Terraform forgets what it built. To remove this bucket
  # deliberately, delete this lifecycle block first, then destroy.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "state_bucket" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions   = ["s3:*"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.state]
}

# ---------------------------------------------------------------------------
# GitHub OIDC provider
#
# Registers token.actions.githubusercontent.com as an identity provider AWS
# will trust. This is what makes keyless CI authentication possible: GitHub
# mints a short-lived JWT describing the job, and AWS verifies it here rather
# than checking a stored secret.
# ---------------------------------------------------------------------------

data "tls_certificate" "github" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # AWS no longer relies on this thumbprint for GitHub's issuer — it validates
  # against a trusted CA — but the API still requires the field. Read from the
  # live certificate so there is nothing stale to hardcode.
  thumbprint_list = [data.tls_certificate.github.certificates[0].sha1_fingerprint]

  tags = local.tags
}

# ---------------------------------------------------------------------------
# Deploy role
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    sid     = "GitHubActionsOIDC"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    # Without this, a token minted for a different audience satisfies the
    # policy. Omitting it is one of the two classic OIDC mistakes.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # The other classic mistake is wildcarding the repository. The repo is
    # always literal here; only the ref portion varies.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for s in var.allowed_subjects : "repo:${var.github_repo}:${s}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = local.role_name
  description          = "Assumed by GitHub Actions via OIDC to deploy ${var.environment}."
  assume_role_policy   = data.aws_iam_policy_document.deploy_trust.json
  max_session_duration = 3600
  tags                 = local.tags
}

data "aws_iam_policy_document" "deploy_permissions" {
  # Deliberately broad for the services the hello-world needs. The account
  # boundary is the primary control; this is the secondary one. Tighten once
  # the real resource set is known — see README.md.
  statement {
    sid    = "ApplicationInfrastructure"
    effect = "Allow"

    actions = [
      "s3:*",
      "cloudfront:*",
      "acm:*",
      "route53:*",
      "lambda:*",
      "apigateway:*",
      "logs:*",
      "cloudwatch:*",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "secretsmanager:GetSecretValue",
      "iam:GetRole",
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:PassRole",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:TagRole",
      "iam:UntagRole",
    ]

    resources = ["*"]
  }

  # A compromised pipeline must not be able to widen its own access, mint
  # long-lived credentials, or reach organization-level controls.
  statement {
    sid    = "DenyPrivilegeEscalation"
    effect = "Deny"

    actions = [
      "iam:CreateUser",
      "iam:CreateAccessKey",
      "iam:CreateLoginProfile",
      "iam:UpdateAssumeRolePolicy",
      "iam:CreateOpenIDConnectProvider",
      "iam:DeleteOpenIDConnectProvider",
      "iam:UpdateOpenIDConnectProviderThumbprint",
      "organizations:*",
      "account:*",
      "sso:*",
      "identitystore:*",
    ]

    resources = ["*"]
  }

  # Nor modify the two things that grant it access in the first place.
  statement {
    sid       = "DenySelfModification"
    effect    = "Deny"
    actions   = ["iam:*"]
    resources = [local.role_arn, aws_iam_openid_connect_provider.github.arn]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy-permissions"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy_permissions.json
}
