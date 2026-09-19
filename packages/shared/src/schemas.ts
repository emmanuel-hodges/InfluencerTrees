// Request schemas (zod) and response types shared by the API and the site.
// The API validates every body with these; the site uses the same schemas
// for form validation so the two never disagree about what is acceptable.
import { z } from 'zod';
import { AVATAR_ID_PATTERN } from './avatar.js';
import { CODENAME_PATTERN } from './codenames.js';
import { HOUSE_SEATS, STATE_CODES, type Prefs } from './constants.js';
import { ID_PATTERN } from './ids.js';

// --- primitives -----------------------------------------------------------

export const emailSchema = z.string().trim().max(254).pipe(z.email('Enter a valid email address'));

/** Lookup key for an address: trimmed and lowercased, nothing else folded. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const codeSchema = z.string().trim().regex(/^\d{6}$/, 'The code is six digits');

export const codenameSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s+/g, ' '))
  .pipe(z.string().regex(CODENAME_PATTERN, 'Codenames look like "Amber Falcon"'));

export const avatarIdSchema = z.string().regex(AVATAR_ID_PATTERN, 'Not an avatar id');

export const idSchema = z.string().regex(ID_PATTERN, 'Ids look like 1234-5678');

/**
 * State is nullable on purpose: the spec marks it required, but the founder
 * asked for the odd case where it cannot be learned to be storable.
 */
export const stateSchema = z.enum(STATE_CODES).nullable();

export const zipSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, 'A zip code is five digits')
  .nullable();

export const districtSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}-(\d{1,2}|AL)$/, 'Districts look like CA-12 or WY-AL')
  .nullable();

/** Accepts 10 US digits in any punctuation, or +1 and 10 digits; stores E.164. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    if (raw === '') return null;
    const digits = raw.replace(/\D/g, '');
    const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    if (national.length !== 10) {
      ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit US phone number' });
      return z.NEVER;
    }
    return `+1${national}`;
  })
  .nullable();

export const votingSchema = z
  .object({
    registered: z.enum(['yes', 'no', 'not_sure']),
    method: z.enum(['election_day', 'early', 'mail', 'not_sure']),
    hasMailBallot: z.enum(['yes', 'no']).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.method === 'mail' && v.hasMailBallot === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['hasMailBallot'],
        message: 'Say whether the mail-in ballot is already in hand',
      });
    }
  });

export type Voting = z.infer<typeof votingSchema>;

export const prefsSchema = z.object({
  emailSharing: z.enum(['convincer', 'hierarchy', 'tree']),
  phoneSharing: z.enum(['convincer', 'nobody']),
  systemEmails: z.enum(['none', 'quarterly', 'unrestricted']),
});

/** The district, when given, must belong to the state and exist there. */
function districtMatchesState(v: { state: string | null; district: string | null }, ctx: z.RefinementCtx) {
  if (!v.district) return;
  const [st, seat] = v.district.split('-');
  if (!v.state || st !== v.state) {
    ctx.addIssue({ code: 'custom', path: ['district'], message: 'The district must be in the chosen state' });
    return;
  }
  const seats = HOUSE_SEATS[st] ?? 0;
  const ok = seats === 1 ? seat === 'AL' : Number(seat) >= 1 && Number(seat) <= seats;
  if (!ok) ctx.addIssue({ code: 'custom', path: ['district'], message: 'That district does not exist' });
}

// --- request bodies -------------------------------------------------------

export const requestCodeBody = z.object({ email: emailSchema });
export type RequestCodeBody = z.infer<typeof requestCodeBody>;

export const verifyBody = z.object({ email: emailSchema, code: codeSchema });
export type VerifyBody = z.infer<typeof verifyBody>;

const personFields = {
  codename: codenameSchema,
  avatarId: avatarIdSchema,
  state: stateSchema,
  zip: zipSchema,
  district: districtSchema,
  phone: phoneSchema,
  voting: votingSchema,
};

/** Intake page 1 of 2, filled in by the convincer. */
export const intakeBody = z
  .object({ email: emailSchema, ...personFields })
  .superRefine(districtMatchesState);
export type IntakeBody = z.infer<typeof intakeBody>;

/** Intake page 2 of 2, confirmed by the new influencer on first login. */
export const onboardingBody = z
  .object({ ...personFields, prefs: prefsSchema })
  .superRefine(districtMatchesState);
export type OnboardingBody = z.infer<typeof onboardingBody>;

/** Later edits from the profile page. */
export const profileUpdateBody = z.object({ ...personFields }).superRefine(districtMatchesState);
export type ProfileUpdateBody = z.infer<typeof profileUpdateBody>;

export const prefsBody = prefsSchema;
export type PrefsBody = z.infer<typeof prefsBody>;

export const objectionBody = z.object({
  text: z.string().trim().min(1, 'Write the objection').max(2000),
  handledNote: z.string().trim().max(4000).nullable().default(null),
});
export type ObjectionBody = z.infer<typeof objectionBody>;

// --- response shapes ------------------------------------------------------

export type SubscriptionStatus = 'invited' | 'active';

export interface Profile {
  influencerId: string;
  email: string;
  codename: string;
  avatarId: string;
  state: string | null;
  zip: string | null;
  district: string | null;
  phone: string | null;
  voting: Voting;
  onboardingComplete: boolean;
  createdAt: string;
}

/** Another influencer as this viewer is allowed to see them. */
export interface PersonCard {
  influencerId: string;
  codename: string;
  avatarId: string;
  state: string | null;
  email: string | null;
  phone: string | null;
  status: SubscriptionStatus;
  joinedAt: string;
}

export interface IdeaSummary {
  ideaId: string;
  name: string;
  description: string;
  displayPrefs: Record<string, string>;
  content: Record<string, string>;
  objectionHandling: Record<string, string>;
}

export interface Subscription {
  ideaId: string;
  convincerId: string;
  prefs: Prefs;
  displayPrefIds: string[];
  status: SubscriptionStatus;
  invitedAt: string;
  activatedAt: string | null;
  /** 0 for the originator, 1 for their direct influencers, and so on. */
  depth: number;
}

export interface MeResponse {
  profile: Profile;
  idea: IdeaSummary;
  subscription: Subscription;
  /** null when the viewer is the idea's originator. */
  convincer: PersonCard | null;
  isOriginator: boolean;
  /** The viewer's direct influencers, invited and active. */
  influencers: PersonCard[];
  counts: { active: number; invited: number };
}

export interface Objection {
  objectionId: string;
  ideaId: string;
  text: string;
  handledNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VerifyResponse {
  ok: true;
  onboardingComplete: boolean;
  /** Only returned to native clients that sent X-Client: native. */
  sessionToken?: string;
}

export interface SuggestResponse {
  codename: string;
  avatarId: string;
}

/**
 * Why an email did not go out, when the transport said. `unverified_recipient`
 * is an account still in the SES sandbox refusing an address that is not a
 * verified identity there; no retry helps until it is.
 */
export type EmailFailure = 'unverified_recipient' | 'send_failed';

export interface IntakeResponse {
  influencerId: string;
  codename: string;
  emailSent: boolean;
  /** Set when emailSent is false. */
  emailFailure: EmailFailure | null;
}

export interface ResendResponse {
  ok: true;
  emailSent: boolean;
  emailFailure: EmailFailure | null;
}

export interface HealthResponse {
  ok: true;
  commit: string;
  stage: string;
}

export interface ApiError {
  error: string;
  message: string;
}
