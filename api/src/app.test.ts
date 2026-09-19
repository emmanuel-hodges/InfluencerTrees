// End-to-end flow through the real handlers against the in-memory store and
// a capturing mailer: founder sign-in, onboarding, intake, the invitee's
// first sign-in, objections, and the ways sign-in must refuse.
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, OTP_MAX_ATTEMPTS, OTP_MAX_SENDS, OTP_TTL_SECONDS, type App } from './app.js';
import { loadConfig } from './config.js';
import { LogMailer, type SendOutcome } from './email/index.js';
import { MemoryStore } from './store/memory.js';

const FOUNDER = 'Founder@Example.com';
const IDEA = '1000-0001';

let app: App;
let mailer: LogMailer;
let store: MemoryStore;
let clock: Date;

const ORIGIN = 'http://localhost:5173';

function req(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('origin', ORIGIN);
  if (init.body) headers.set('content-type', 'application/json');
  if (init.cookie) headers.set('cookie', init.cookie);
  return app.request(`http://localhost${path}`, { ...init, headers });
}

const post = (path: string, body: unknown, cookie?: string) =>
  req(path, { method: 'POST', body: JSON.stringify(body), cookie });
const put = (path: string, body: unknown, cookie?: string) =>
  req(path, { method: 'PUT', body: JSON.stringify(body), cookie });
const get = (path: string, cookie?: string) => req(path, { cookie });

function lastCode(): string {
  const mail = mailer.sent.at(-1)!;
  return /code is (\d{6})/.exec(mail.text)![1]!;
}

// Test bodies are read loosely; the shapes are asserted with toMatchObject.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (res: Response): Promise<any> => res.json() as Promise<any>;

function cookieOf(res: Response): string {
  const raw = res.headers.get('set-cookie');
  expect(raw).toBeTruthy();
  return raw!.split(';')[0]!;
}

async function signIn(email: string): Promise<{ cookie: string; onboardingComplete: boolean }> {
  expect((await post('/api/auth/request-code', { email })).status).toBe(200);
  const res = await post('/api/auth/verify', { email, code: lastCode() });
  expect(res.status).toBe(200);
  const body = (await json(res)) as { onboardingComplete: boolean };
  return { cookie: cookieOf(res), onboardingComplete: body.onboardingComplete };
}

const person = {
  state: 'CA',
  zip: '94110',
  district: 'CA-11',
  phone: '(415) 555-0100',
  voting: { registered: 'yes', method: 'mail', hasMailBallot: 'no' },
};

beforeEach(() => {
  clock = new Date('2026-09-18T12:00:00Z');
  store = new MemoryStore();
  mailer = new LogMailer(() => undefined);
  app = createApp({
    config: loadConfig({
      STORE: 'memory',
      EMAIL_MODE: 'log',
      FOUNDER_EMAIL: FOUNDER,
      PUBLIC_BASE_URL: ORIGIN,
      COOKIE_SECURE: 'false',
    }),
    store,
    mailer,
    now: () => clock,
  });
});

describe('health', () => {
  it('answers without a session', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ ok: true, stage: 'local' });
  });
});

describe('sign in', () => {
  it('creates the founder and the idea on the first code request', async () => {
    const { cookie, onboardingComplete } = await signIn(FOUNDER);
    expect(onboardingComplete).toBe(false);
    const me = await json(await get('/api/me', cookie));
    expect(me).toMatchObject({
      isOriginator: true,
      convincer: null,
      idea: { ideaId: IDEA, name: 'Elect Democratic US House and Senate Legislators' },
      subscription: { convincerId: '0000-0000', depth: 0, status: 'active' },
      profile: { email: FOUNDER, onboardingComplete: false },
    });
    expect(me.profile.codename).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+/);
  });

  it('answers unknown addresses neutrally and sends nothing', async () => {
    const res = await post('/api/auth/request-code', { email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
    expect(mailer.sent).toHaveLength(0);
    const verify = await post('/api/auth/verify', { email: 'nobody@example.com', code: '123456' });
    expect(verify.status).toBe(410);
  });

  it('rejects wrong codes, then locks after the attempt cap', async () => {
    await post('/api/auth/request-code', { email: FOUNDER });
    const real = lastCode();
    const wrong = real === '000000' ? '000001' : '000000';
    for (let i = 1; i <= OTP_MAX_ATTEMPTS; i += 1) {
      const res = await post('/api/auth/verify', { email: FOUNDER, code: wrong });
      expect(res.status).toBe(400);
      expect((await json(res)).error).toBe('invalid_code');
    }
    const locked = await post('/api/auth/verify', { email: FOUNDER, code: real });
    expect(locked.status).toBe(429);
  });

  it('expires codes', async () => {
    await post('/api/auth/request-code', { email: FOUNDER });
    const code = lastCode();
    clock = new Date(clock.getTime() + (OTP_TTL_SECONDS + 1) * 1000);
    const res = await post('/api/auth/verify', { email: FOUNDER, code });
    expect(res.status).toBe(410);
  });

  it('caps how many codes one address can request in a window', async () => {
    for (let i = 0; i < OTP_MAX_SENDS; i += 1) {
      expect((await post('/api/auth/request-code', { email: FOUNDER })).status).toBe(200);
    }
    expect((await post('/api/auth/request-code', { email: FOUNDER })).status).toBe(429);
    clock = new Date(clock.getTime() + 16 * 60 * 1000);
    expect((await post('/api/auth/request-code', { email: FOUNDER })).status).toBe(200);
  });

  it('accepts the code exactly once and the session works as cookie or bearer', async () => {
    await post('/api/auth/request-code', { email: FOUNDER });
    const code = lastCode();
    const first = await req('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ email: FOUNDER, code }),
      headers: { 'x-client': 'native' },
    });
    expect(first.status).toBe(200);
    const { sessionToken } = (await json(first)) as { sessionToken: string };
    expect(sessionToken).toBeTruthy();
    const again = await post('/api/auth/verify', { email: FOUNDER, code });
    expect(again.status).toBe(410);

    const asBearer = await req('/api/me', { headers: { authorization: `Bearer ${sessionToken}` } });
    expect(asBearer.status).toBe(200);
    const asCookie = await get('/api/me', cookieOf(first));
    expect(asCookie.status).toBe(200);
  });

  it('refuses cross-site writes and unauthenticated reads', async () => {
    const res = await app.request('http://localhost/api/auth/request-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ email: FOUNDER }),
    });
    expect(res.status).toBe(403);
    expect((await get('/api/me')).status).toBe(401);
  });

  it('logs out', async () => {
    const { cookie } = await signIn(FOUNDER);
    expect((await post('/api/auth/logout', {}, cookie)).status).toBe(200);
    expect((await get('/api/me', cookie)).status).toBe(401);
  });
});

describe('onboarding, intake and the invitee', () => {
  it('walks the whole loop', async () => {
    const founder = await signIn(FOUNDER);

    // Intake is refused until the founder has finished their own intake 2.
    const early = await post(`/api/ideas/${IDEA}/intake`, { email: 'x@example.com' }, founder.cookie);
    expect(early.status).toBe(400); // invalid body first
    const suggest = (await json(await get('/api/codename/suggest', founder.cookie))) as {
      codename: string;
      avatarId: string;
    };

    const onboarded = await post(
      '/api/me/onboarding',
      { ...suggest, ...person, prefs: { emailSharing: 'tree', phoneSharing: 'convincer', systemEmails: 'none' } },
      founder.cookie,
    );
    expect(onboarded.status).toBe(200);
    const me = await json(onboarded);
    expect(me.profile).toMatchObject({ codename: suggest.codename, onboardingComplete: true, phone: '+14155550100' });
    expect(me.subscription.displayPrefIds).toEqual(['email:tree', 'phone:convincer', 'notify:none']);

    // Self-invite and duplicate emails are refused.
    const self = await post(`/api/ideas/${IDEA}/intake`, { email: FOUNDER, ...suggest, ...person }, founder.cookie);
    expect(self.status).toBe(400);
    expect((await json(self)).error).toBe('self_invite');

    const invitee = 'New.Person@example.com';
    const identity = (await json(await get('/api/codename/suggest', founder.cookie))) as { codename: string; avatarId: string };
    const intake = await post(
      `/api/ideas/${IDEA}/intake`,
      { email: invitee, ...identity, state: null, zip: null, district: null, phone: null, voting: { registered: 'not_sure', method: 'not_sure', hasMailBallot: null } },
      founder.cookie,
    );
    expect(intake.status).toBe(201);
    expect(await json(intake)).toMatchObject({ codename: identity.codename, emailSent: true });
    const invitation = mailer.sent.at(-1)!;
    expect(invitation.to).toBe(invitee);
    expect(invitation.subject).toContain(suggest.codename);
    expect(invitation.text).toContain(`${ORIGIN}/login`);

    const dup = await post(`/api/ideas/${IDEA}/intake`, { email: invitee.toUpperCase(), ...identity, ...person }, founder.cookie);
    expect(dup.status).toBe(409);
    expect((await json(dup)).error).toBe('email_taken');

    // The founder sees the invited recruit, with email and phone.
    let founderMe = await json(await get('/api/me', founder.cookie));
    expect(founderMe.counts).toEqual({ active: 0, invited: 1 });
    expect(founderMe.influencers[0]).toMatchObject({ codename: identity.codename, status: 'invited', email: invitee });

    // Resend is rate limited.
    const recruitId = founderMe.influencers[0].influencerId as string;
    const resend = await post(`/api/ideas/${IDEA}/influencers/${recruitId}/resend`, {}, founder.cookie);
    expect(resend.status).toBe(429);
    clock = new Date(clock.getTime() + 11 * 60 * 1000);
    const resendLater = await post(`/api/ideas/${IDEA}/influencers/${recruitId}/resend`, {}, founder.cookie);
    expect(resendLater.status).toBe(200);

    // The invitee signs in with a differently-cased address and lands on intake 2.
    const recruit = await signIn('new.person@EXAMPLE.com');
    expect(recruit.onboardingComplete).toBe(false);
    let recruitMe = await json(await get('/api/me', recruit.cookie));
    expect(recruitMe).toMatchObject({
      isOriginator: false,
      subscription: { convincerId: founderMe.profile.influencerId, depth: 1, status: 'invited' },
    });
    // The founder chose "tree" so the recruit sees the founder's email, never the phone.
    expect(recruitMe.convincer).toMatchObject({ codename: suggest.codename, email: FOUNDER, phone: null });

    // Intake is refused before onboarding.
    const tooEarly = await post(`/api/ideas/${IDEA}/intake`, { email: 'z@example.com', ...identity, ...person }, recruit.cookie);
    expect(tooEarly.status).toBe(403);

    // The recruit keeps the codename, changes the avatar, hides the phone.
    const done = await post(
      '/api/me/onboarding',
      {
        codename: identity.codename,
        avatarId: 'thumbs:zzzzzzzzzzzzzzzz',
        ...person,
        prefs: { emailSharing: 'convincer', phoneSharing: 'nobody', systemEmails: 'quarterly' },
      },
      recruit.cookie,
    );
    expect(done.status).toBe(200);
    recruitMe = await json(done);
    expect(recruitMe.subscription.status).toBe('active');
    expect(recruitMe.profile.onboardingComplete).toBe(true);

    founderMe = await json(await get('/api/me', founder.cookie));
    expect(founderMe.counts).toEqual({ active: 1, invited: 0 });
    expect(founderMe.influencers[0]).toMatchObject({ status: 'active', email: invitee, phone: null });

    // Codenames stay unique across edits.
    const clash = await put('/api/me', { ...person, codename: suggest.codename, avatarId: identity.avatarId }, recruit.cookie);
    expect(clash.status).toBe(409);
    const rename = await put('/api/me', { ...person, codename: 'Quiet Otter', avatarId: identity.avatarId }, recruit.cookie);
    expect(rename.status).toBe(200);
    expect((await json(rename)).codename).toBe('Quiet Otter');

    // Prefs can change on their own.
    const prefs = await put(`/api/ideas/${IDEA}/prefs`, { emailSharing: 'hierarchy', phoneSharing: 'convincer', systemEmails: 'unrestricted' }, recruit.cookie);
    expect(prefs.status).toBe(200);
    expect((await json(prefs)).displayPrefIds).toEqual(['email:hierarchy', 'phone:convincer', 'notify:unrestricted']);
  });

  it('keeps objections private per influencer and idea', async () => {
    const founder = await signIn(FOUNDER);
    const created = await post(`/api/ideas/${IDEA}/objections`, { text: 'It costs too much', handledNote: null }, founder.cookie);
    expect(created.status).toBe(201);
    const objection = await json(created);

    const listed = await json(await get(`/api/ideas/${IDEA}/objections`, founder.cookie));
    expect(listed.objections).toHaveLength(1);

    const edited = await put(
      `/api/ideas/${IDEA}/objections/${objection.objectionId}`,
      { text: 'It costs too much', handledNote: 'Showed the budget page' },
      founder.cookie,
    );
    expect(edited.status).toBe(200);
    expect((await json(edited)).handledNote).toBe('Showed the budget page');

    expect((await get(`/api/ideas/9999-9999/objections`, founder.cookie)).status).toBe(404);

    const deleted = await req(`/api/ideas/${IDEA}/objections/${objection.objectionId}`, { method: 'DELETE', cookie: founder.cookie });
    expect(deleted.status).toBe(200);
    const after = await json(await get(`/api/ideas/${IDEA}/objections`, founder.cookie));
    expect(after.objections).toHaveLength(0);
  });

  it('validates bodies with a readable message', async () => {
    const founder = await signIn(FOUNDER);
    const bad = await post(
      '/api/me/onboarding',
      { codename: 'x', avatarId: 'nope', state: 'CA', zip: '1', district: null, phone: null, voting: person.voting, prefs: {} },
      founder.cookie,
    );
    expect(bad.status).toBe(400);
    const body = await json(bad);
    expect(body.error).toBe('invalid_body');
    expect(body.message).toMatch(/codename/);
  });
});

describe('invitation delivery', () => {
  it('reports why an invitation did not go out and leaves resend open until one does', async () => {
    // The log mailer records every message; this transport answers as told.
    let outcome: SendOutcome = 'sent';
    const recorder = mailer;
    app = createApp({
      config: loadConfig({ STORE: 'memory', EMAIL_MODE: 'log', FOUNDER_EMAIL: FOUNDER, PUBLIC_BASE_URL: ORIGIN, COOKIE_SECURE: 'false' }),
      store,
      mailer: {
        send: async (mail) => {
          await recorder.send(mail);
          return outcome;
        },
      },
      now: () => clock,
    });

    const founder = await signIn(FOUNDER);
    const suggest = await json(await get('/api/codename/suggest', founder.cookie));
    const onboarded = await post(
      '/api/me/onboarding',
      { ...suggest, ...person, prefs: { emailSharing: 'tree', phoneSharing: 'convincer', systemEmails: 'none' } },
      founder.cookie,
    );
    expect(onboarded.status).toBe(200);

    // The sandbox refuses the recruit's address: the record is kept, the
    // reason is reported, and no cooldown starts because nothing was sent.
    outcome = 'unverified_recipient';
    const invitee = 'tester@example.com';
    const identity = await json(await get('/api/codename/suggest', founder.cookie));
    const intake = await post(`/api/ideas/${IDEA}/intake`, { email: invitee, ...identity, ...person }, founder.cookie);
    expect(intake.status).toBe(201);
    expect(await json(intake)).toMatchObject({ emailSent: false, emailFailure: 'unverified_recipient' });

    const me = await json(await get('/api/me', founder.cookie));
    expect(me.influencers[0]).toMatchObject({ email: invitee, status: 'invited' });
    const recruitId = me.influencers[0].influencerId as string;
    const resendPath = `/api/ideas/${IDEA}/influencers/${recruitId}/resend`;

    const refusedAgain = await post(resendPath, {}, founder.cookie);
    expect(refusedAgain.status).toBe(200);
    expect(await json(refusedAgain)).toMatchObject({ ok: true, emailSent: false, emailFailure: 'unverified_recipient' });

    outcome = 'failed';
    expect(await json(await post(resendPath, {}, founder.cookie))).toMatchObject({ emailSent: false, emailFailure: 'send_failed' });

    // Once the address is verified the resend delivers, and only then does
    // the cooldown apply.
    outcome = 'sent';
    const delivered = await post(resendPath, {}, founder.cookie);
    expect(delivered.status).toBe(200);
    expect(await json(delivered)).toMatchObject({ emailSent: true, emailFailure: null });
    expect(recorder.sent.at(-1)!.to).toBe(invitee);
    expect((await post(resendPath, {}, founder.cookie)).status).toBe(429);
  });
});
