# Handoff: MVP Part 1 on branch `mvp`

Everything a fresh session needs to pick this work up. Read `CLAUDE.md`
first (conventions and every decision, short form), then
`docs/design/backend-and-auth.md` (the argument), then this file (the state).

_Updated: 2026-09-19_

---

## What exists

Branch `mvp`, pushed to `origin`, five commits ahead of `main`:

| Area | Where | Notes |
|---|---|---|
| Shared contract | `packages/shared/src` | zod request schemas, response types, US states and House seats, sharing-preference catalogue, codename and avatar helpers |
| API | `api/src` | Hono app (`app.ts`), config, store interface with in-memory and DynamoDB implementations, SES and log mailers, seed, Lambda and local entry points, end-to-end test |
| Site | `web/src` | Vite + React 19 + react-router 7: login, Convince, Intake 1 of 2, Welcome (Intake 2 of 2), Profile, objections; DiceBear avatars from a seed |
| Infrastructure | `infra/modules/app`, `infra/modules/static-site`, `infra/beta`, `infra/prod` | DynamoDB, Lambda, HTTP API, SES identity and DKIM, second CloudFront origin for `/api/*`, viewer-request function with SPA fallback |
| Bootstrap change | `infra/bootstrap/modules/bootstrap/main.tf` | `dynamodb:*`, `ses:*`, conditioned `iam:CreateServiceLinkedRole`, `DenyPipelineDataPlane`; boundary gains the data-plane actions |
| Pipeline | `.github/workflows/deploy.yml`, `preview.yml`, `scripts/` | `mvp` deploys the beta stage only; prod gated on `main`; API built in the build job, shipped as a second artifact; `test.sh`, `build-api.sh`, `smoke.sh`, `check-ses.sh` |
| Docs | `CLAUDE.md`, `docs/design/backend-and-auth.md`, `infra/*/README.md` | decisions recorded, open-decisions table closed |

Verified: `scripts/test.sh` passes (19 tests), `scripts/check-infra.sh`
passes, and the whole loop was walked in a browser against the local API:
founder sign-in, Intake 2 of 2, Convince, an intake that sent an
invitation, the invitee signing in and landing on their Intake 2 of 2.

## Founder-only steps and their status

| Step | Status |
|---|---|
| Re-apply `infra/bootstrap/beta` (two in-place updates) | **Done 2026-09-19.** Output in `bootstrap-beta-apply.log` at the repo root, gitignored |
| `FOUNDER_EMAIL` repository variable | **Set** by the founder on 2026-09-19 |
| Verify the founder's address in beta's SES sandbox | **Identity created**; the founder must click the link AWS emailed. Until then no code reaches the inbox |
| First beta deploy of the branch | See *Deploy status* below |
| First real sign-in on preview.influencertrees.com | Pending the two rows above |
| Before merging to `main`: re-apply `infra/bootstrap/prod` (same two updates), request SES production access in prod, remove `mvp` from `deploy.yml`'s push trigger in the merge PR | Not started |

## Deploy status

_Filled in at the end of the 2026-09-19 session; see the last section of
this file._

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
- Alarms and a notification topic for SES bounces (metrics exist under the
  configuration set).
- DMARC `rua=` reporting address and a custom MAIL FROM domain.
- An origin-verify header on the `execute-api` hostname, if abuse appears.
- Front-end unit tests; the site is verified by typecheck, build, and the
  browser walkthrough.
- Account deletion and a privacy page.

## Gotchas learned the hard way

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
