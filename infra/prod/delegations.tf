# ---------------------------------------------------------------------------
# Subtrees handed to other accounts
#
# This is the only record prod writes on behalf of another environment.
# Everything under preview.influencertrees.com — the beta stage, per-branch
# previews, their certificate validation — is created by the beta account in
# its own zone (infra/beta). Beta never holds credentials for this zone.
#
# Name servers are public DNS data, not secrets, so they live in the repo.
# They come from `terraform output preview_zone_name_servers` in infra/beta
# and only change if that zone is destroyed and recreated.
# ---------------------------------------------------------------------------

locals {
  preview_zone_name_servers = [
    "ns-1472.awsdns-56.org",
    "ns-1589.awsdns-06.co.uk",
    "ns-610.awsdns-12.net",
    "ns-62.awsdns-07.com",
  ]
}

resource "aws_route53_record" "preview_delegation" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = "preview.${var.domain_name}"
  type    = "NS"
  ttl     = 300
  records = local.preview_zone_name_servers
}
