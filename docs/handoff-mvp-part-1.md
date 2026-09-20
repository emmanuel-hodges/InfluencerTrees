# Handoff: MVP Part 1 on branch `mvp`

Everything a fresh session needs to pick this work up. Read `CLAUDE.md`
first (conventions and every decision, short form), then
`docs/design/backend-and-auth.md` (the argument), then this file (the state).

_Updated: 2026-09-19_

---

## What exists

Branch `mvp`, pushed to `origin`, seven commits ahead of `main` (run `git log main..mvp`):

| Area | Where | Notes |
|---|---|---|
| Shared contract | `packages/shared/src` | zod request schemas, response types, US states and House seats, sharing-preference catalogue, codename and avatar helpers |
| API | `api/src` | Hono app (`app.ts`), config, store interface with in-memory and DynamoDB implementations, SES and log mailers, seed, Lambda and local entry points, end-to-end test |
| Site | `web/src` | Vite + React 19 + react-router 7: login, Convince, Intake 1 of 2, Welcome (Intake 2 of 2), Profile, objections; public About and Contact pages; DiceBear avatars from a seed |
| Infrastructure | `infra/modules/app`, `infra/modules/static-site`, `infra/beta`, `infra/prod` | DynamoDB, Lambda, HTTP API, SES identity and DKIM, second CloudFront origin for `/api/*`, viewer-request function with SPA fallback |
| Bootstrap change | `infra/bootstrap/modules/bootstrap/main.tf` | `dynamodb:*`, `ses:*`, conditioned `iam:CreateServiceLinkedRole`, `DenyPipelineDataPlane`; boundary gains the data-plane actions |
| Pipeline | `.github/workflows/deploy.yml`, `preview.yml`, `scripts/` | `mvp` deploys the beta stage only; prod gated on `main`; API built in the build job, shipped as a second artifact; `test.sh`, `build-api.sh`, `smoke.sh`, `check-ses.sh`, `verify-recipient.sh`, `request-ses-production.sh` |
| Docs | `CLAUDE.md`, `docs/design/backend-and-auth.md`, `infra/*/README.md` | decisions recorded, open-decisions table closed |

Verified: `scripts/test.sh` passes (29 tests), `scripts/check-infra.sh`
passes, and the whole loop was walked in a browser against the local API:
founder sign-in, Intake 2 of 2, Convince, an intake that sent an
invitation, the invitee signing in and landing on their Intake 2 of 2.

## Founder-only steps and their status

| Step | Status |
|---|---|
| Re-apply `infra/bootstrap/beta` (two in-place updates) | **Done 2026-09-19.** Output in `bootstrap-beta-apply.log` at the repo root, gitignored |
| `FOUNDER_EMAIL` repository variable | **Set** by the founder on 2026-09-19, then **changed to a different address** the same evening; the branch was redeployed so the Lambda carries the new value. Only that variable feeds the Lambda, so any later change needs `gh workflow run deploy.yml --ref mvp` |
| Verify the founder's address in beta's SES sandbox | **Done 2026-09-19**; codes arrive. The identity for the earlier address is still pending and can be deleted |
| First beta deploy of the branch | See *Deploy status* below |
| First real sign-in on preview.influencertrees.com | **Done 2026-09-19**: the founder signed in, finished Intake 2 of 2, reached Convince, and ran an intake |
| Request SES production access for beta | **Requested 2026-09-19, marked DENIED within the hour**, support case `178986180400076`, which stays open: AWS asked for sending frequency, list upkeep, bounce, complaint and unsubscribe handling, and examples. The reply, finalized 2026-09-20 and kept in `docs/ses-production-access.md`, goes into the case from Support Center; then wait for AWS's answer. `scripts/request-ses-production.sh` refuses to resubmit after a denial unless `RESUBMIT=1`; reply in the case instead. Standing: `AWS_PROFILE=iad-tf-beta scripts/check-ses.sh beta`. Nothing to redeploy if granted |
| Re-apply `infra/bootstrap/beta` for `sns:*` (third in-place update) | **Done 2026-09-20**; output appended to `bootstrap-beta-apply.log`. The plan was one in-place update to the deploy role's policy and nothing else |
| Confirm the bounce and complaint subscription | **Done 2026-09-20**, from the support inbox; `AWS_PROFILE=iad-tf-beta aws sns list-subscriptions` shows a real subscription ARN. Every bounce and complaint in beta now emails `influencertrees-support@pm.me`. Prod repeats the bootstrap step, then the click, before its own request |
| Verify a beta tester's address before inviting them | **The working path today**, since the request above was denied. The first invitee's address is unverified, so SES refused the invitation and the resend on 2026-09-19. `AWS_PROFILE=iad-tf-beta scripts/verify-recipient.sh beta <email>`, they click the link AWS sends, then *Resend invitation* on the Convince page |
| Before merging to `main`: re-apply `infra/bootstrap/prod` (same two updates), request SES production access in prod with `scripts/request-ses-production.sh prod <contact-email>`, remove `mvp` from `deploy.yml`'s push trigger in the merge PR | Not started |

## Deploy status

**Live on the beta stage since 2026-09-19.** The third deploy run of the
branch applied cleanly (fifteen resources added), synced the site, and its
smoke test confirmed https://preview.influencertrees.com serves the branch
build and its API reports the same commit. A request for a sign-in code for
an unknown address returned the neutral `{"ok":true}` through CloudFront,
which proves the function reaches DynamoDB with the new role.

- SES domain identity `preview.influencertrees.com`: DKIM **SUCCESS**,
  hosted zone `dkim.amazonses.com` (the default; no tfvars change needed),
  verified for sending.
- Beta's SES production access was requested and denied (see the table
  above), so beta is sandboxed: sending enabled, 200 messages a day,
  verified recipients only. The account suppresses bounced and complained
  addresses and the configuration set has reputation metrics on; both were
  already so and are cited in the request.
- The founder's recipient identity is verified. The first invitation went to
  an unverified tester and SES refused it with `MessageRejected`, as the
  sandbox must; the record was kept with `lastInviteSentAt` null, so
  *Resend invitation* has no cooldown to wait out once the address is
  verified with `scripts/verify-recipient.sh`. An AWS verification link
  lasts 24 hours; the script says how to get a fresh one.
- The beta table was still empty when the founder address changed, so no
  record needed moving: the founder and the first idea are created on the
  new address's first code request, with that account as originator.
- The first two runs of the branch failed as expected before the bootstrap
  was re-applied; run one also exposed the two ordering bugs listed under
  *Gotchas*, fixed in commit `f68443c`.

## How to resume

```bash
npm ci
```

```bash
scripts/test.sh
```

Local run: copy `api/.env.example` to `api/.env.local`, set `FOUNDER_EMAIL`,
then `npm run dev`. Codes print in the API terminal. See *Local setup* in
`CLAUDE.md`.

Pipeline state:

```bash
gh run list --branch mvp --limit 5
```

Redeploy the branch to the beta stage without a commit:

```bash
gh workflow run deploy.yml --ref mvp
```

After a successful apply, check the sending domain once:

```bash
AWS_PROFILE=iad-tf-beta scripts/check-ses.sh beta
```

If it reports a DKIM hosted zone other than `dkim.amazonses.com`, put that
value in `infra/beta/terraform.tfvars` as `dkim_hosted_zone` and redeploy.

## What is deliberately not in Part 1

- IdeaList, TreeView, Survey, and idea content: skipped per the spec. The
  Convince page shows disabled "coming soon" affordances where they belong.
- Alarms on the SES metrics. A bounce and complaint notification topic now
  exists in the app module, off until the bootstrap gains `sns:*`.
- DMARC `rua=` reporting address and a custom MAIL FROM domain.
- An origin-verify header on the `execute-api` hostname, if abuse appears.
- Front-end unit tests; the site is verified by typecheck, build, and the
  browser walkthrough.
- Account deletion in the product. The public About page says what is kept
  and that deletion is on request to the contact address; until deletion
  exists, the founder does it by hand in the table.

## Gotchas learned the hard way

- **SES authorises a send against every identity the message touches**,
  the recipient included when it is a verified identity in the account,
  which every sandbox tester is. The first real code was refused with
  `AccessDeniedException` until the API role's send statement covered
  `identity/*` under a From-address condition (commit `7223cba`).
- **The ViewOnlyAccess permission set allows only `ses:List*`.** SES Get
  calls, and so `check-ses.sh`, need the admin profile; the symptom is
  `AccessDeniedException` on the action, not an expired SSO session.
- **`MessageRejected` from SES in beta means the recipient is not verified.**
  The mailer reports it as `unverified_recipient` and logs SES's message
  with addresses redacted, so the Lambda log says why on its own.
- **This Mac runs Node 26 from Homebrew.** CI and Lambda use Node 22
  (`.nvmrc`). Everything works on 26, but keep the target at 22.
- **One Vite for the tree.** The root `package.json` has
  `overrides.vite`; without it vitest hoists Vite 8 beside web's Vite 7 and
  the dev server breaks with a fast-refresh error.
- **A hanging vitest run was a looping test**, not vitest: `randomId` with a
  random source that only returns zero can never leave the sentinel.
- **The preview tool exports `PORT`** for the server it launches, so the
  local API listens on `API_PORT` instead.
- **Two Terraform ordering lessons** from the first beta apply: a CloudFront
  function cannot be deleted while the distribution references it, so beta's
  function keeps its original name and moves address with a `moved` block;
  an API Gateway stage with per-route settings must `depends_on` its routes.
- **npm's install-script policy** warns about esbuild's postinstall; the
  binary works regardless.
- `.claude/` is gitignored; the dev launch config lives there.

## Decisions the founder confirmed on 2026-09-18

- First idea: "Elect Democratic US House and Senate Legislators". Its
  one-line description in `api/src/seed.ts` is a placeholder.
- Email sharing: convincer, hierarchy (own convincer chain), whole tree,
  with a note that the system keeps the address regardless. Phone sharing:
  convincer or nobody. System emails: none, quarterly, unrestricted, scoped
  per idea (stored on the subscription).
- Intake 1 of 2 collects every field. `state` is nullable on purpose despite
  the spec's star.
- The beta SSO session may be used for local runs against
  `inftrees-app-dev` and for the bootstrap apply.
- Docker and Java are not needed and were not installed.
- Contact and reply-to address (2026-09-20): `influencertrees-support@pm.me`,
  a support inbox the founder reads, now the app module's default, and a
  must for every sent message. The About page no longer names the first
  idea, no longer promises that nothing is sent on a schedule (system emails
  are a planned preference), and, after the founder's own edits the same
  evening, no longer describes the email at all or mentions cookies; it says
  what the site is, what it keeps and who sees it, with phone visibility
  stated as convincer-only. The stop path lives in the emails and on
  Contact. The invitation's About link now reads "What InfluencerTrees is,
  what it collects, and who sees it".
