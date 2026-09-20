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
  role_name = "github-actions-deploy-${var.environment}"

  # Built by hand rather than referencing aws_iam_role.deploy.arn, which would
  # create a dependency cycle: the role's policy cannot reference the role.
  role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.role_name}"

  # Every role the pipeline creates for the application lives under this path
  # and carries the permissions boundary below. The main infrastructure must
  # honour both — see outputs and README.
  app_role_path        = "/inftrees/"
  app_role_arn_pattern = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/inftrees/*"

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

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # AWS does not use this value for GitHub's issuer — since mid-2023 it
  # validates the token against a trusted CA — but the API still requires the
  # field. A fixed value is deliberate: reading it from the live certificate
  # would fetch GitHub on every plan and drift whenever the cert rotates, for
  # a field nothing checks. This is GitHub's published thumbprint at the time
  # of writing; it going stale has no effect.
  thumbprint_list = ["1c58a3a8518e8759bf075b76b750d4f2df264fcd"]

  tags = local.tags
}

# ---------------------------------------------------------------------------
# Deploy role
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    sid    = "GitHubActionsOIDC"
    effect = "Allow"
    # configure-aws-credentials calls TagSession by default; without it the
    # first pipeline run fails on "not authorized to perform: sts:TagSession".
    actions = ["sts:AssumeRoleWithWebIdentity", "sts:TagSession"]

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

# ---------------------------------------------------------------------------
# Permissions boundary for pipeline-created roles
#
# The pipeline needs iam:CreateRole to give Lambdas an execution role. On its
# own that is an escalation path: create a role, attach AdministratorAccess,
# pass it to a Lambda. A permissions boundary caps what any role the pipeline
# creates can ever do, regardless of what policies get attached to it. The
# deploy role may only create roles that carry this boundary.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "boundary" {
  statement {
    sid    = "MaximumForPipelineCreatedRoles"
    effect = "Allow"

    actions = [
      "s3:*",
      "cloudfront:*",
      "lambda:*",
      "apigateway:*",
      "logs:*",
      "cloudwatch:*",
      "xray:*",
      # Data plane for the application: the Lambda role reads and writes
      # rows in its own table and sends mail as the domain. No Scan, so no
      # runtime role can dump a table, and no control plane at all.
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
      "ses:SendEmail",
      "ses:SendRawEmail",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
      "secretsmanager:GetSecretValue",
    ]

    resources = ["*"]
  }
}

resource "aws_iam_policy" "boundary" {
  name        = "inftrees-ci-boundary-${var.environment}"
  description = "Ceiling for every IAM role created by the ${var.environment} deploy pipeline."
  policy      = data.aws_iam_policy_document.boundary.json
  tags        = local.tags
}

data "aws_iam_policy_document" "deploy_permissions" {
  # Service-level wildcards, deliberately: the resource set does not exist yet.
  # The account boundary is the primary control. Tighten to ARNs once the real
  # resources are known.
  statement {
    sid    = "ApplicationInfrastructure"
    effect = "Allow"

    actions = [
      "s3:*",
      "cloudfront:*",
      "acm:*",
      "route53:*",
      "dynamodb:*", # control plane only; the data plane is denied below
      "ses:*",      # identities, DKIM, configuration sets; sending is denied below
      "lambda:*",
      "apigateway:*",
      "logs:*",
      "cloudwatch:*",
      "sns:*", # the topic SES publishes bounces and complaints to (2026-09-20)
      "xray:*",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
      "secretsmanager:GetSecretValue",
    ]

    resources = ["*"]
  }

  # Reads are harmless and Terraform needs them to refresh state.
  statement {
    sid    = "ReadIam"
    effect = "Allow"

    actions = [
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:ListPolicyVersions",
    ]

    resources = ["*"]
  }

  # The only way the pipeline may create or widen a role: under the app path,
  # and only if the role carries the boundary. Any attempt without it is denied
  # by absence — there is no other statement that permits these actions.
  statement {
    sid    = "CreateAndWidenAppRolesOnlyWithBoundary"
    effect = "Allow"

    actions = [
      "iam:CreateRole",
      "iam:AttachRolePolicy",
      "iam:PutRolePolicy",
    ]

    resources = [local.app_role_arn_pattern]

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.boundary.arn]
    }
  }

  # Managing app roles otherwise: narrowing, deleting, tagging, and adjusting
  # their trust policy (Lambda's service principal, for instance). These cannot
  # widen anything a boundary-capped role can do.
  statement {
    sid    = "ManageAppRoles"
    effect = "Allow"

    actions = [
      "iam:DeleteRole",
      "iam:DetachRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
      "iam:UpdateAssumeRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
    ]

    resources = [local.app_role_arn_pattern]
  }

  # PassRole is the classic escalation: hand a privileged role to a service you
  # control. Scoped to the app path, where every role is boundary-capped.
  statement {
    sid       = "PassAppRolesOnly"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [local.app_role_arn_pattern]
  }

  # API Gateway creates its service-linked role the first time an API is
  # created in an account, and the caller needs this one permission for that.
  # Scoped to that service: it cannot create any other role.
  statement {
    sid       = "CreateApiGatewayServiceLinkedRole"
    effect    = "Allow"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::*:role/aws-service-role/ops.apigateway.amazonaws.com/*"]

    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values   = ["ops.apigateway.amazonaws.com"]
    }
  }

  # The beta role is assumable from any branch of the repository. It may
  # create tables and sending identities, but it must never read or write a
  # row, send mail as the domain, or take the account out of the SES sandbox.
  # Those belong to running code and to humans, not to the pipeline.
  statement {
    sid    = "DenyPipelineDataPlane"
    effect = "Deny"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:TransactGetItems",
      "dynamodb:TransactWriteItems",
      "dynamodb:PartiQLSelect",
      "dynamodb:PartiQLInsert",
      "dynamodb:PartiQLUpdate",
      "dynamodb:PartiQLDelete",
      "dynamodb:ExportTableToPointInTime",
      "dynamodb:RestoreTableFromBackup",
      "dynamodb:RestoreTableToPointInTime",
      "ses:SendEmail",
      "ses:SendRawEmail",
      "ses:SendBulkEmail",
      "ses:SendTemplatedEmail",
      "ses:SendBulkTemplatedEmail",
      "ses:SendCustomVerificationEmail",
      "ses:PutAccountDetails",
    ]

    resources = ["*"]
  }

  # A compromised pipeline must not mint long-lived credentials, strip or swap
  # a boundary, edit the boundary policy, or reach organization-level controls.
  statement {
    sid    = "DenyPrivilegeEscalation"
    effect = "Deny"

    actions = [
      "iam:CreateUser",
      "iam:CreateAccessKey",
      "iam:CreateLoginProfile",
      "iam:CreateOpenIDConnectProvider",
      "iam:DeleteOpenIDConnectProvider",
      "iam:UpdateOpenIDConnectProviderThumbprint",
      "iam:DeleteRolePermissionsBoundary",
      "iam:PutRolePermissionsBoundary",
      "iam:CreatePolicyVersion",
      "iam:SetDefaultPolicyVersion",
      "iam:DeletePolicyVersion",
      "organizations:*",
      "account:*",
      "sso:*",
      "identitystore:*",
    ]

    resources = ["*"]
  }

  # Nor touch the three things that define its own access.
  statement {
    sid     = "DenySelfModification"
    effect  = "Deny"
    actions = ["iam:*"]

    resources = [
      local.role_arn,
      aws_iam_openid_connect_provider.github.arn,
      aws_iam_policy.boundary.arn,
    ]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy-permissions"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy_permissions.json
}
