# Backend shape and auth model

**Status:** Decided — 2026-09-18
**Settles:** the two items `accounts-and-iac.md` left open: backend shape, and
the auth transport that the mobile approach depends on
**Records:** the mobile approach as a leaning, with the decisions that keep
it open

---

## Context

The MVP needs a login by emailed one-time code, a store for influencers,
ideas, subscriptions and objection notes, and outbound email for codes and
invitations. Until now the repository deployed a static page. The deploy
roles could create Lambdas and buckets but nothing else, by design.

Three constraints shaped this beyond the hard constraints in `CLAUDE.md`:

1. **One developer, editing from an iPad half the time.** Anything that needs
   a container runtime, a running database, or a daily credential dance is a
   cost paid on every edit.
2. **The database and the auth transport are the two things that harden once
   users exist.** Everything else here is a packaging choice.
3. **Previews never run Terraform.** A pull request preview is files synced
   into infrastructure that `main` owns. Whatever the backend is, a preview
   has to reach one without an apply.

The recommendation was produced by a design pass on 2026-09-18: four fact
checks against current AWS and GitHub documentation, three independent
proposals from different angles, two judges scoring them against the
constraints above. The winning shape, with the best ideas from the
runners-up grafted in, is what follows.

---

## Decision: serverless, inside the accounts that exist

Per workload account: one Node 22 Lambda on arm64 running a Hono router,
behind an API Gateway HTTP API; one DynamoDB on-demand table; one SES v2
domain identity. Defined once in `infra/modules/app` and instantiated from
`infra/beta` and `infra/prod`.

### Why not containers or a managed database

Containers and RDS both need a VPC, and with it `ec2:*` and `rds:*` on a
deploy role that GitHub can assume from any branch of the repository, a
password in Secrets Manager that would be the project's first secret, and a
bill that runs while nobody is logged in. None of that buys anything at tens
of users. The Hono app is adapter-agnostic: the same module runs under Node
locally and under Lambda in the cloud, and would run in a container later
with a different adapter and a different Terraform module.

### Why DynamoDB is the least-regrettable database

What makes a database hard to leave is data volume and access-pattern
coupling in the code, not the engine. At this scale the whole dataset is
kilobytes, and a point-in-time export to S3 plus a load script moves it to
Postgres in an afternoon. The reverse trip, leaving RDS, is the expensive
one, so if the relational question is ever forced the migration runs in the
cheap direction. Coupling is contained: every read and write goes through
`api/src/store`, and no handler sees a partition key.

The data is also already the right shape. Lookups by id and by email,
children of a convincer within an idea, and one influencer's notes are all
key-value or one-hop adjacency. The one index, `gsi1`, answers "who did X
convince", which is also the future TreeView query, one level per query.

Guardrails: point-in-time recovery, and deletion protection so a wrong apply
fails instead of deleting. Turning that off is a deliberate change of its
own.

### Same-origin `/api/*`

The API is exposed as a second origin on the CloudFront distributions that
already exist, with an ordered behaviour for `/api/*` that caches nothing
and forwards every viewer header except `Host`. The browser sees one origin,
so there is no CORS and the session cookie is first-party. The beta
distribution serves every `pr-<n>` hostname, so every preview reaches beta's
API without any preview-specific infrastructure. That is the preview model:
**a preview is the branch's site on top of beta's backend and data.** A pull
request that changes the API contract is proven on the beta stage first.

The `execute-api` hostname stays reachable directly. That is accepted: every
route authenticates itself, nothing depends on CloudFront for security, and
API Gateway's own throttle caps the spend.

### The CloudFront function

The viewer-request function that already routed hostnames to bucket folders
now also sends client-side routes to `index.html`, so `/convince` loads the
app. It runs in prod too. `custom_error_response` was rejected for this: it
is distribution-wide, so it would turn the API's 401 and 404 JSON into a 200
`index.html`, and it cannot follow the per-folder layout in beta.

---

## Decision: a custom email one-time code, not Cognito

The Lambda owns sign-in. A code request stores a salted hash of a six-digit
code with a ten-minute expiry, a five-attempt cap and a three-sends-per-
fifteen-minutes limit, and sends the code through SES. A correct code issues
an opaque 256-bit session id, stored hashed with a thirty-day sliding expiry,
delivered as an `HttpOnly` `__Host-` cookie and also accepted as a bearer
token. Unknown addresses get the same neutral answer as known ones and no
email; only intake creates accounts, so there is nothing to sign up for.

### Why not Cognito's native email OTP

Cognito's passwordless email code was the runner-up, and it was checked
against current documentation rather than assumed. Three findings decided
it:

- **The password factor cannot be removed.** `PASSWORD` must stay in the
  pool's allowed first factors; "passwordless" would be enforced by creating
  users without one and by client flags, not structurally.
- **The code email can only be customised by setting MFA to optional**, and
  the pool must send through SES anyway, so SES setup is not avoided.
- **Every login during development would be a real email** to a mailbox the
  developer may not be able to read. The custom flow prints the code to the
  terminal locally, so the whole login, intake and invitation loop runs in
  tests without a network.

Cognito's genuine advantage is that AWS owns the code that generates,
expires and rate-limits codes. That advantage was weighed against the above
and against a fourth system with immutable pool settings and its own SDK in
the site. The custom flow is about two hundred lines, covered by the
end-to-end test in `api/src/app.test.ts`, and every limit is a named
constant at the top of `api/src/app.ts`.

### Why not a third-party identity provider

It would move the user directory outside the account boundary, add a vendor
to the login path, and require a long-lived API key, which is the class of
secret this project forbids.

### Why the auth model is safe to change later

What hardens is the identity key and the credential transport baked into
every client. The identity key is the email address in our own table, so a
later move to Cognito or to passkeys is an import of addresses and ids, with
no password hashes to migrate. The transport is one middleware that accepts
the same opaque id as a cookie or as a bearer header, so a native shell needs
no server change. There is no signing key anywhere: DynamoDB and SES are
IAM-authenticated, and a session is a random id, which also means instant
revocation.

---

## Decision: React SPA now, Capacitor later

The site is a Vite and React single-page app that Capacitor can wrap
unchanged for the App Store and Google Play. Expo would mean rewriting the
UI in React Native components. This is recorded as a leaning rather than a
commitment because nothing about it has to be done yet; what had to be
decided now is done:

- bearer-capable auth, above;
- no cookie-only assumption anywhere; the token store on device is a later
  client-side choice;
- the API base is `/api` today and becomes an absolute, configurable URL for
  the shell, with a CORS allowlist for its two origins added to the Hono app
  at that point;
- a mobile-first UI, because Apple's "repackaged website" rule is a product
  problem, not a wrapper problem.

Signing, store accounts and the macOS runner workflow wait for a real app.

---

## Email

Each account verifies the domain whose zone it owns: `preview.influencertrees.com`
in beta and `influencertrees.com` in prod, with Easy DKIM CNAME records and a
DMARC record starting at `p=none`. Beta never touches the apex zone. Every
new account starts in the SES sandbox, which only delivers to verified
addresses. Beta was kept there at first so that pre-production code could
not email a stranger; that turned out to cost a realistic test of the one
thing the product does, because every tester had to click an AWS
verification email before the invitation could reach them. So on
2026-09-19 production access was requested for beta too, with
`scripts/request-ses-production.sh`, a human step in every account because
the deploy role is denied `ses:PutAccountDetails`. AWS denied that first
request the same day; its reasons live in the support case, and the answer
to them is the next step. Prod requests its own before it invites anyone
real, and should learn from beta's case first. `scripts/check-ses.sh` reports DKIM status
and the hosted zone SES expects the records to point at, which can differ
per identity. `scripts/verify-recipient.sh` verifies a tester's address
while an account is still sandboxed.

AWS's reply to the beta request asked for the usual four things: sending
frequency, how recipient lists are kept, how bounces, complaints and
unsubscribe requests are handled, and examples. Answering them well needed
three things the product lacked, all added on 2026-09-20. Every message now
carries a reply-to that a person reads (`CONTACT_EMAIL`, the founder's
address by default), because the From is a no-reply and neither domain
receives mail. A public `/about` page says what the site is, what it keeps
and who sees it, and `/contact` says how to reach a person, be blocked from
further mail, or have an account deleted; every invitation links `/about`
and says how to make sure nothing more arrives. And
the app module can publish bounces and complaints to an SNS topic that emails
an inbox: live in beta since 2026-09-20, and off in any account until its
deploy role has `sns:*`. The reply itself is kept in
`docs/ses-production-access.md` so prod's request starts from it.

**Every sent message must carry `influencertrees-support@pm.me` in the reply-to field.** This is non-negotiable for SES compliance and the user experience.
Enforced two ways: the app module's `contact_email` defaults to that address
and no root overrides it, and `makeMailer` throws at startup when SES mode
has no contact address, so a deployment without a reply-to cannot send.

The sandbox shows up in the application as a refused send. The SES mailer
tells that refusal (`MessageRejected`, naming the recipient) apart from any
other failure and reports `unverified_recipient`; the intake and resend
responses carry it as `emailFailure`, and the site says the address has to
be verified rather than suggesting a retry. The mailer logs SES's message
with every address redacted, so the log says why without saying to whom.
Two facts about SES authorisation were learned from the first real sends:
the sandbox refuses an unverified recipient with `MessageRejected`, and
IAM authorises a send against every identity the message touches, a
verified recipient included, which is why the API role may send to
`identity/*` under a From-address condition rather than to the domain
identity alone.

---

## Decision: ad supported, with a paid opt-out

Recorded 2026-09-20 from the founder; nothing is built yet.

The website and app will be ad supported, to pay for cloud resources,
development, maintenance and support. A member can pay a small subscription
fee to opt out of ads. If the member opts back in to ads, the subscription
fee stops again.

What this fixes now, so that later work does not fight it:

- The public About page no longer claims that the site shows no advertising
  or uses no analytics, and says the sign-in cookie is the only cookie
  *today*. Ads and analytics bring their own cookies and scripts, so the page
  must change the day they land.
- Whether a member sees ads is a fact about the member, so it lives on the
  influencer record or a subscription-shaped item in the single table: a new
  item shape, not a new table, per the key-schema decision.
- On iOS and Android, a subscription bought inside the app must go through
  the store's own in-app purchase, which takes a commission; the web can use
  a card processor directly. So the ad-free state has to be settable from
  more than one payment source, and the API, not the client, decides whether
  ads show.
- Email is unaffected: ads and subscriptions send no mail, and the SES story
  stays transactional-only until system emails exist.

---

## What changed in the pipeline

- The bootstrap deploy role gained `dynamodb:*` and `ses:*` for the control
  plane, a conditioned `iam:CreateServiceLinkedRole` for API Gateway, and a
  new deny that keeps it from ever reading a row, sending mail as the domain,
  or requesting SES production access. The boundary for pipeline-created
  roles gained the DynamoDB data-plane actions and the two SES send actions.
  Hand-applied, once per account.
- The build job also bundles the API and uploads it as a second artifact;
  the deploy jobs hand the zip to Terraform, so beta and prod run identical
  bytes. The deploy jobs still install nothing.
- One named feature branch deploys the beta stage only. Prod is skipped by
  a job condition and refused by the prod role's trust policy underneath.

---

## Implementation notes

Two things the first beta apply taught, both now in the modules:

- **A CloudFront function cannot be deleted while the distribution still
  references it.** Terraform starts orphan deletions immediately, in
  parallel with everything else, and the distribution's own update lands
  minutes later. Renaming the function is therefore a replacement that
  fails on every apply. Beta's function keeps its original name and moves
  to its new address with a `moved` block, so the SPA fallback is an
  in-place code update. Prod, which had no function, gets the accurate name.
- **An API Gateway stage with per-route settings must depend on the
  routes it names**, or `CreateStage` races them and answers NotFound.

Status and the remaining founder-only steps are tracked in
`docs/handoff-mvp-part-1.md`.

## Consequences

- Beta has one Terraform state. While a feature branch is live on the beta
  stage, a push to `main` would plan to remove that branch's resources.
  Deletion protection turns that into a failed apply rather than lost data;
  the rule is to leave `main` alone until the branch merges.
- Local development uses an in-memory store for tests and quick runs, and
  the `inftrees-app-dev` table in the beta account over SSO for anything
  that should persist. Nothing local needs Docker or Java.
- The bounce and complaint metrics land in CloudWatch under the environment's
  configuration set; alarms and a notification topic are a follow-up.
- Costs at tens of users round to the two hosted zones that already exist.
