// The HTTP API: one Hono app, mounted at /api, that runs unchanged in Lambda
// (src/lambda.ts) and under Node locally (src/local.ts). Handlers talk to a
// Store and a Mailer; nothing here knows about DynamoDB or SES.
import { zValidator } from '@hono/zod-validator';
import {
  DEFAULT_PREFS, ORIGIN_CONVINCER_ID, intakeBody, normalizeCodename, normalizeEmail, objectionBody, onboardingBody,
  prefsBody, prefsToDisplayPrefIds, profileUpdateBody, requestCodeBody, verifyBody,
  type ApiError, type HealthResponse, type IdeaSummary, type IntakeResponse, type MeResponse, type Objection,
  type PersonCard, type Profile, type ResendResponse, type Subscription, type SuggestResponse, type VerifyResponse,
} from '@inftrees/shared';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { originAllowed, type Config } from './config.js';
import { invitationMail, loginCodeMail, type Mailer } from './email/index.js';
import { hashesMatch, newAvatar, newCode, newInfluencerId, newObjectionId, newSalt, newSessionToken, sha256 } from './ids.js';
import { ensureFounder, freeCodename } from './seed.js';
import type { IdeaRecord, InfluencerRecord, ObjectionRecord, Store, SubscriptionRecord } from './store/types.js';

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS = 3;
export const OTP_SEND_WINDOW_SECONDS = 15 * 60;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_TOUCH_SECONDS = 60 * 60;
export const RESEND_COOLDOWN_SECONDS = 10 * 60;

export interface AppDeps {
  config: Config;
  store: Store;
  mailer: Mailer;
  /** Injectable clock, for tests. */
  now?: () => Date;
}

type Env = { Variables: { influencer: InfluencerRecord; sessionHash: string } };

type ValidationIssues = { issues: ReadonlyArray<{ path?: ReadonlyArray<PropertyKey>; message: string }> };

export function createApp(deps: AppDeps) {
  const { config, store, mailer } = deps;
  const now = deps.now ?? (() => new Date());
  const nowSeconds = () => Math.floor(now().getTime() / 1000);
  // __Host- cookies must be Secure, which http://localhost cannot be.
  const cookieName = config.cookieSecure ? '__Host-session' : 'session';

  const fail = (c: Context, status: ContentfulStatusCode, error: string, message: string) =>
    c.json<ApiError>({ error, message }, status);

  // Turns the first validation issue into a readable 400. Typed loosely on
  // purpose: zod 4 hands the validator a core error, not the classic class.
  const invalid = (result: { success: boolean; error?: ValidationIssues }, c: Context) => {
    if (!result.success) {
      const issue = result.error?.issues[0];
      const where = issue?.path?.length ? `${issue.path.map(String).join('.')}: ` : '';
      return fail(c, 400, 'invalid_body', `${where}${issue?.message ?? 'Invalid request'}`);
    }
    return undefined;
  };

  const app = new Hono<Env>().basePath('/api');

  // Cross-site writes are refused. The session cookie is SameSite=Lax and
  // every body is JSON, so a cross-site browser request cannot reach a
  // handler with the cookie anyway; this is the belt to that braces.
  app.use('*', async (c, next) => {
    const method = c.req.method;
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const origin = c.req.header('origin');
      if (origin && !originAllowed(origin, config.allowedOriginHosts)) {
        return fail(c, 403, 'forbidden', 'Cross-site request refused');
      }
      if (!origin && c.req.header('sec-fetch-site') === 'cross-site') {
        return fail(c, 403, 'forbidden', 'Cross-site request refused');
      }
    }
    await next();
  });

  app.get('/health', (c) => c.json<HealthResponse>({ ok: true, commit: config.buildCommit, stage: config.stage }));

  // --- sign in ------------------------------------------------------------

  app.post('/auth/request-code', zValidator('json', requestCodeBody, invalid), async (c) => {
    const { email } = c.req.valid('json');
    const emailNorm = normalizeEmail(email);
    const t = nowSeconds();

    let influencer = await store.getInfluencerByEmail(emailNorm);
    if (!influencer && config.founderEmail && emailNorm === normalizeEmail(config.founderEmail)) {
      influencer = await ensureFounder(store, config.founderEmail, now());
    }
    // Unknown addresses get the same answer as known ones, and no email.
    // Only intake creates accounts, so there is nothing to sign up for.
    if (!influencer) return c.json({ ok: true });

    const existing = await store.getOtp(emailNorm);
    let sends = 1;
    let windowStart = t;
    if (existing && existing.windowStart + OTP_SEND_WINDOW_SECONDS > t) {
      if (existing.sends >= OTP_MAX_SENDS) {
        return fail(c, 429, 'rate_limited', 'Too many codes requested. Try again in a few minutes.');
      }
      sends = existing.sends + 1;
      windowStart = existing.windowStart;
    }

    const code = newCode();
    const salt = newSalt();
    await store.putOtp({
      emailNorm,
      codeHash: sha256(salt + code),
      salt,
      attempts: 0,
      sends,
      windowStart,
      expiresAt: t + OTP_TTL_SECONDS,
    });
    await mailer.send(loginCodeMail(influencer.email, code, OTP_TTL_SECONDS / 60));

    const body: Record<string, unknown> = { ok: true };
    if (config.devReturnCode) body.devCode = code;
    return c.json(body);
  });

  app.post('/auth/verify', zValidator('json', verifyBody, invalid), async (c) => {
    const { email, code } = c.req.valid('json');
    const emailNorm = normalizeEmail(email);
    const t = nowSeconds();

    const attempt = await store.consumeOtpAttempt(emailNorm, OTP_MAX_ATTEMPTS, t);
    if (attempt.kind === 'expired') await store.deleteOtp(emailNorm);
    if (attempt.kind === 'missing' || attempt.kind === 'expired') {
      return fail(c, 410, 'expired_code', 'That code has expired. Send a new one.');
    }
    if (attempt.kind === 'locked') {
      return fail(c, 429, 'too_many_attempts', 'Too many wrong codes. Send a new one.');
    }

    const otp = attempt.record;
    if (!hashesMatch(sha256(otp.salt + code), otp.codeHash)) {
      const left = OTP_MAX_ATTEMPTS - otp.attempts;
      const hint = left > 0 ? `${left} ${left === 1 ? 'attempt' : 'attempts'} left.` : 'Send a new one.';
      return fail(c, 400, 'invalid_code', `That code didn't match. ${hint}`);
    }
    await store.deleteOtp(emailNorm);

    const influencer = await store.getInfluencerByEmail(emailNorm);
    if (!influencer) return fail(c, 410, 'expired_code', 'That code has expired. Send a new one.');

    const token = newSessionToken();
    await store.putSession({
      tokenHash: sha256(token),
      influencerId: influencer.influencerId,
      createdAt: t,
      expiresAt: t + SESSION_TTL_SECONDS,
      lastSeenAt: t,
    });
    setCookie(c, cookieName, token, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });

    const res: VerifyResponse = { ok: true, onboardingComplete: influencer.onboardingComplete };
    // A native shell has no cookie jar worth trusting; it asks for the token.
    if (c.req.header('x-client') === 'native') res.sessionToken = token;
    return c.json(res);
  });

  // --- session ------------------------------------------------------------

  const bearer = (c: Context): string | undefined => {
    const h = c.req.header('authorization');
    return h?.startsWith('Bearer ') ? h.slice(7).trim() : undefined;
  };

  const requireSession: MiddlewareHandler<Env> = async (c, next) => {
    const token = getCookie(c, cookieName) ?? bearer(c);
    if (!token) return fail(c, 401, 'unauthorized', 'Sign in to continue');
    const hash = sha256(token);
    const t = nowSeconds();
    const session = await store.getSession(hash);
    if (!session || session.expiresAt <= t) return fail(c, 401, 'unauthorized', 'Sign in to continue');
    const influencer = await store.getInfluencer(session.influencerId);
    if (!influencer) return fail(c, 401, 'unauthorized', 'Sign in to continue');
    if (t - session.lastSeenAt > SESSION_TOUCH_SECONDS) {
      await store.touchSession(hash, t, t + SESSION_TTL_SECONDS);
    }
    c.set('influencer', influencer);
    c.set('sessionHash', hash);
    await next();
  };

  const authed = new Hono<Env>();
  authed.use('*', requireSession);

  authed.post('/auth/logout', async (c) => {
    await store.deleteSession(c.get('sessionHash'));
    deleteCookie(c, cookieName, { path: '/', secure: config.cookieSecure });
    return c.json({ ok: true });
  });

  // --- shaping ------------------------------------------------------------

  const toProfile = (r: InfluencerRecord): Profile => ({
    influencerId: r.influencerId,
    email: r.email,
    codename: r.codename,
    avatarId: r.avatarId,
    state: r.state,
    zip: r.zip,
    district: r.district,
    phone: r.phone,
    voting: r.voting,
    onboardingComplete: r.onboardingComplete,
    createdAt: r.createdAt,
  });

  const toIdea = (i: IdeaRecord): IdeaSummary => ({
    ideaId: i.ideaId,
    name: i.name,
    description: i.description,
    displayPrefs: i.displayPrefs,
    content: i.content,
    objectionHandling: i.objectionHandling,
  });

  const toSubscription = (s: SubscriptionRecord): Subscription => ({
    ideaId: s.ideaId,
    convincerId: s.convincerId,
    prefs: s.prefs,
    displayPrefIds: prefsToDisplayPrefIds(s.prefs),
    status: s.status,
    invitedAt: s.invitedAt,
    activatedAt: s.activatedAt,
    depth: s.ancestorPath.length,
  });

  const toObjection = (o: ObjectionRecord): Objection => ({
    objectionId: o.objectionId,
    ideaId: o.ideaId,
    text: o.text,
    handledNote: o.handledNote,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  });

  /** Another person, showing only what the viewer's relationship permits. */
  const card = (r: InfluencerRecord, s: SubscriptionRecord, show: { email: boolean; phone: boolean }): PersonCard => ({
    influencerId: r.influencerId,
    codename: r.codename,
    avatarId: r.avatarId,
    state: r.state,
    email: show.email ? r.email : null,
    phone: show.phone ? r.phone : null,
    status: s.status,
    joinedAt: s.activatedAt ?? s.invitedAt,
  });

  async function buildMe(me: InfluencerRecord): Promise<MeResponse | null> {
    const [sub] = await store.listSubscriptions(me.influencerId);
    if (!sub) return null;
    const idea = await store.getIdea(sub.ideaId);
    if (!idea) return null;

    const isOriginator = sub.convincerId === ORIGIN_CONVINCER_ID;
    let convincer: PersonCard | null = null;
    if (!isOriginator) {
      const cInf = await store.getInfluencer(sub.convincerId);
      const cSub = cInf ? await store.getSubscription(cInf.influencerId, sub.ideaId) : null;
      // A recruit is below their convincer, so only "whole tree" reaches
      // them; the phone is never shown upward.
      if (cInf && cSub) convincer = card(cInf, cSub, { email: cSub.prefs.emailSharing === 'tree', phone: false });
    }

    const direct = await store.listDirectInfluencers(sub.ideaId, me.influencerId);
    const influencers = (
      await Promise.all(
        direct.map(async (ds) => {
          const r = await store.getInfluencer(ds.influencerId);
          // The viewer typed these addresses at intake; every sharing level
          // includes the direct convincer. The phone follows its own switch.
          return r ? card(r, ds, { email: true, phone: ds.prefs.phoneSharing === 'convincer' }) : null;
        }),
      )
    ).filter((x): x is PersonCard => x !== null);

    return {
      profile: toProfile(me),
      idea: toIdea(idea),
      subscription: toSubscription(sub),
      convincer,
      isOriginator,
      influencers,
      counts: {
        active: influencers.filter((i) => i.status === 'active').length,
        invited: influencers.filter((i) => i.status === 'invited').length,
      },
    };
  }

  // --- me -----------------------------------------------------------------

  authed.get('/me', async (c) => {
    const me = await buildMe(c.get('influencer'));
    if (!me) return fail(c, 500, 'incomplete', 'This account has no idea subscription');
    return c.json<MeResponse>(me);
  });

  authed.put('/me', zValidator('json', profileUpdateBody, invalid), async (c) => {
    const me = c.get('influencer');
    const body = c.req.valid('json');
    const updated: InfluencerRecord = {
      ...me,
      codename: body.codename,
      codenameNorm: normalizeCodename(body.codename),
      avatarId: body.avatarId,
      state: body.state,
      zip: body.zip,
      district: body.district,
      phone: body.phone,
      voting: body.voting,
      updatedAt: now().toISOString(),
    };
    const result = await store.updateInfluencer(updated, me.codenameNorm);
    if (result === 'codename_taken') return fail(c, 409, 'codename_taken', 'That codename is taken. Generate a new one.');
    return c.json<Profile>(toProfile(updated));
  });

  authed.post('/me/onboarding', zValidator('json', onboardingBody, invalid), async (c) => {
    const me = c.get('influencer');
    const body = c.req.valid('json');
    const t = now().toISOString();
    const [sub] = await store.listSubscriptions(me.influencerId);
    if (!sub) return fail(c, 500, 'incomplete', 'This account has no idea subscription');

    const updated: InfluencerRecord = {
      ...me,
      codename: body.codename,
      codenameNorm: normalizeCodename(body.codename),
      avatarId: body.avatarId,
      state: body.state,
      zip: body.zip,
      district: body.district,
      phone: body.phone,
      voting: body.voting,
      onboardingComplete: true,
      updatedAt: t,
    };
    const result = await store.updateInfluencer(updated, me.codenameNorm);
    if (result === 'codename_taken') return fail(c, 409, 'codename_taken', 'That codename is taken. Generate a new one.');

    await store.putSubscription({
      ...sub,
      prefs: body.prefs,
      status: 'active',
      activatedAt: sub.activatedAt ?? t,
    });
    const meResponse = await buildMe(updated);
    return c.json<MeResponse>(meResponse!);
  });

  authed.put('/ideas/:ideaId/prefs', zValidator('json', prefsBody, invalid), async (c) => {
    const me = c.get('influencer');
    const sub = await store.getSubscription(me.influencerId, c.req.param('ideaId'));
    if (!sub) return fail(c, 404, 'not_found', 'You are not part of that idea');
    const updated = { ...sub, prefs: c.req.valid('json') };
    await store.putSubscription(updated);
    return c.json<Subscription>(toSubscription(updated));
  });

  authed.get('/codename/suggest', async (c) => {
    return c.json<SuggestResponse>({ codename: await freeCodename(store), avatarId: newAvatar() });
  });

  // --- intake -------------------------------------------------------------

  authed.post('/ideas/:ideaId/intake', zValidator('json', intakeBody, invalid), async (c) => {
    const me = c.get('influencer');
    const ideaId = c.req.param('ideaId');
    const body = c.req.valid('json');

    const mySub = await store.getSubscription(me.influencerId, ideaId);
    if (!mySub) return fail(c, 404, 'not_found', 'You are not part of that idea');
    if (!me.onboardingComplete) return fail(c, 403, 'forbidden', 'Finish your own intake first');

    const emailNorm = normalizeEmail(body.email);
    if (emailNorm === me.emailNorm) return fail(c, 400, 'self_invite', "That's your own email address");

    const existing = await store.getInfluencerByEmail(emailNorm);
    if (existing) {
      const theirSub = await store.getSubscription(existing.influencerId, ideaId);
      if (theirSub?.status === 'invited' && theirSub.convincerId === me.influencerId) {
        return fail(c, 409, 'email_taken', 'You already invited that address. Use Resend invitation on the Convince page.');
      }
      // Who already has them is deliberately not revealed.
      return fail(c, 409, 'email_taken', 'That email already belongs to an influencer of this idea.');
    }

    const t = now().toISOString();
    const influencer: InfluencerRecord = {
      influencerId: newInfluencerId(),
      email: body.email,
      emailNorm,
      codename: body.codename,
      codenameNorm: normalizeCodename(body.codename),
      avatarId: body.avatarId,
      state: body.state,
      zip: body.zip,
      district: body.district,
      phone: body.phone,
      voting: body.voting,
      onboardingComplete: false,
      createdAt: t,
      updatedAt: t,
    };
    const sub: SubscriptionRecord = {
      influencerId: influencer.influencerId,
      ideaId,
      convincerId: me.influencerId,
      prefs: { ...DEFAULT_PREFS },
      status: 'invited',
      invitedAt: t,
      activatedAt: null,
      ancestorPath: [...mySub.ancestorPath, me.influencerId],
      lastInviteSentAt: null,
    };

    const result = await store.createInfluencer(influencer, sub);
    if (result === 'email_taken') return fail(c, 409, 'email_taken', 'That email already belongs to an influencer of this idea.');
    if (result === 'codename_taken') return fail(c, 409, 'codename_taken', 'That codename was just taken. Generate a new one.');

    const idea = await store.getIdea(ideaId);
    const emailSent = await mailer.send(invitationMail(influencer.email, me.codename, idea?.name ?? 'the idea', config.publicBaseUrl));
    if (emailSent) await store.putSubscription({ ...sub, lastInviteSentAt: t });

    return c.json<IntakeResponse>({ influencerId: influencer.influencerId, codename: influencer.codename, emailSent }, 201);
  });

  authed.post('/ideas/:ideaId/influencers/:influencerId/resend', async (c) => {
    const me = c.get('influencer');
    const ideaId = c.req.param('ideaId');
    const target = await store.getInfluencer(c.req.param('influencerId'));
    const sub = target ? await store.getSubscription(target.influencerId, ideaId) : null;
    if (!target || !sub || sub.convincerId !== me.influencerId) return fail(c, 404, 'not_found', 'No such invitation');
    if (sub.status !== 'invited') return fail(c, 409, 'already_active', 'They have already signed in');

    const t = now();
    if (sub.lastInviteSentAt && t.getTime() - Date.parse(sub.lastInviteSentAt) < RESEND_COOLDOWN_SECONDS * 1000) {
      return fail(c, 429, 'rate_limited', 'An invitation was sent recently. Try again in a few minutes.');
    }
    const idea = await store.getIdea(ideaId);
    const emailSent = await mailer.send(invitationMail(target.email, me.codename, idea?.name ?? 'the idea', config.publicBaseUrl));
    if (emailSent) await store.putSubscription({ ...sub, lastInviteSentAt: t.toISOString() });
    return c.json<ResendResponse>({ ok: true, emailSent });
  });

  // --- objections ---------------------------------------------------------

  const requireIdea = async (c: Context<Env>): Promise<string | Response> => {
    const ideaId = c.req.param('ideaId')!;
    const sub = await store.getSubscription(c.get('influencer').influencerId, ideaId);
    return sub ? ideaId : fail(c, 404, 'not_found', 'You are not part of that idea');
  };

  authed.get('/ideas/:ideaId/objections', async (c) => {
    const ideaId = await requireIdea(c);
    if (typeof ideaId !== 'string') return ideaId;
    const list = await store.listObjections(c.get('influencer').influencerId, ideaId);
    return c.json({ objections: list.map(toObjection) });
  });

  authed.post('/ideas/:ideaId/objections', zValidator('json', objectionBody, invalid), async (c) => {
    const ideaId = await requireIdea(c);
    if (typeof ideaId !== 'string') return ideaId;
    const t = now();
    const body = c.req.valid('json');
    const record: ObjectionRecord = {
      objectionId: newObjectionId(t),
      influencerId: c.get('influencer').influencerId,
      ideaId,
      text: body.text,
      handledNote: body.handledNote,
      createdAt: t.toISOString(),
      updatedAt: t.toISOString(),
    };
    await store.putObjection(record);
    return c.json<Objection>(toObjection(record), 201);
  });

  authed.put('/ideas/:ideaId/objections/:objectionId', zValidator('json', objectionBody, invalid), async (c) => {
    const ideaId = await requireIdea(c);
    if (typeof ideaId !== 'string') return ideaId;
    const me = c.get('influencer');
    const existing = await store.getObjection(me.influencerId, ideaId, c.req.param('objectionId'));
    if (!existing) return fail(c, 404, 'not_found', 'No such objection');
    const body = c.req.valid('json');
    const updated: ObjectionRecord = { ...existing, text: body.text, handledNote: body.handledNote, updatedAt: now().toISOString() };
    await store.putObjection(updated);
    return c.json<Objection>(toObjection(updated));
  });

  authed.delete('/ideas/:ideaId/objections/:objectionId', async (c) => {
    const ideaId = await requireIdea(c);
    if (typeof ideaId !== 'string') return ideaId;
    await store.deleteObjection(c.get('influencer').influencerId, ideaId, c.req.param('objectionId'));
    return c.json({ ok: true });
  });

  app.route('/', authed);

  app.notFound((c) => fail(c, 404, 'not_found', 'No such route'));
  app.onError((err, c) => {
    console.error('unhandled', { name: err.name, message: err.message, stack: err.stack });
    return fail(c, 500, 'internal', 'Something went wrong');
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
