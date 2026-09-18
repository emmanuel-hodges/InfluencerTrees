// The first idea and its founding influencer. There is no sign-up and nobody
// invites the founder, so the founder is created on their first code
// request, when the address matches FOUNDER_EMAIL. Idempotent: guarded by
// the email uniqueness item and the idea's conditional put.
import { DEFAULT_PREFS, DISPLAY_PREFS, ORIGIN_CONVINCER_ID, normalizeCodename, normalizeEmail } from '@inftrees/shared';
import { newAvatar, newCodename, newInfluencerId } from './ids.js';
import type { IdeaRecord, InfluencerRecord, Store, SubscriptionRecord } from './store/types.js';

/** The one idea for now. Its id is fixed so every environment agrees on it. */
export const FIRST_IDEA = {
  ideaId: '1000-0001',
  name: 'Elect Democratic US House and Senate Legislators',
  description:
    'Convince people to vote for Democratic candidates for the US House and Senate in 2026, and to become influencers who convince others to do the same.',
};

export async function freeCodename(store: Store): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = newCodename(attempt >= 3);
    if (!(await store.isCodenameTaken(normalizeCodename(candidate)))) return candidate;
  }
  throw new Error('could not find a free codename');
}

export async function ensureFounder(store: Store, founderEmail: string, now: Date): Promise<InfluencerRecord> {
  const emailNorm = normalizeEmail(founderEmail);
  const existing = await store.getInfluencerByEmail(emailNorm);
  if (existing) return existing;

  const t = now.toISOString();
  const codename = await freeCodename(store);
  const founder: InfluencerRecord = {
    influencerId: newInfluencerId(),
    email: founderEmail.trim(),
    emailNorm,
    codename,
    codenameNorm: normalizeCodename(codename),
    avatarId: newAvatar(),
    state: null,
    zip: null,
    district: null,
    phone: null,
    voting: { registered: 'not_sure', method: 'not_sure', hasMailBallot: null },
    onboardingComplete: false,
    createdAt: t,
    updatedAt: t,
  };
  const root: SubscriptionRecord = {
    influencerId: founder.influencerId,
    ideaId: FIRST_IDEA.ideaId,
    convincerId: ORIGIN_CONVINCER_ID,
    prefs: { ...DEFAULT_PREFS },
    status: 'active',
    invitedAt: t,
    activatedAt: t,
    ancestorPath: [],
    lastInviteSentAt: null,
  };
  const result = await store.createInfluencer(founder, root);
  if (result === 'email_taken') return (await store.getInfluencerByEmail(emailNorm))!;
  if (result === 'codename_taken') return ensureFounder(store, founderEmail, now);

  const idea: IdeaRecord = {
    ...FIRST_IDEA,
    displayPrefs: { ...DISPLAY_PREFS },
    content: {},
    objectionHandling: {},
    originatorId: founder.influencerId,
    createdAt: t,
  };
  await store.putIdeaIfAbsent(idea);
  return founder;
}
