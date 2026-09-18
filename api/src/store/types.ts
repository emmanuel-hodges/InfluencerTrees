// The persistence interface. Handlers never see a partition key; every
// access pattern the app needs is a method here, which is what keeps a later
// move between engines a change to one directory.
import type { Prefs, Voting } from '@inftrees/shared';

export interface InfluencerRecord {
  influencerId: string;
  /** As typed, for display. */
  email: string;
  /** Trimmed and lowercased, for lookup and uniqueness. */
  emailNorm: string;
  codename: string;
  codenameNorm: string;
  avatarId: string;
  state: string | null;
  zip: string | null;
  district: string | null;
  phone: string | null;
  voting: Voting;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaRecord {
  ideaId: string;
  name: string;
  description: string;
  displayPrefs: Record<string, string>;
  content: Record<string, string>;
  objectionHandling: Record<string, string>;
  originatorId: string;
  createdAt: string;
}

export interface SubscriptionRecord {
  influencerId: string;
  ideaId: string;
  /** "0000-0000" for the idea's originator. */
  convincerId: string;
  prefs: Prefs;
  status: 'invited' | 'active';
  invitedAt: string;
  activatedAt: string | null;
  /** Root first, direct convincer last; empty for the originator. */
  ancestorPath: string[];
  lastInviteSentAt: string | null;
}

export interface ObjectionRecord {
  objectionId: string;
  influencerId: string;
  ideaId: string;
  text: string;
  handledNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OtpRecord {
  emailNorm: string;
  codeHash: string;
  salt: string;
  attempts: number;
  sends: number;
  /** Epoch seconds; the send-rate window starts here. */
  windowStart: number;
  /** Epoch seconds; DynamoDB's TTL attribute. */
  expiresAt: number;
}

export interface SessionRecord {
  tokenHash: string;
  influencerId: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
}

export type OtpAttempt =
  | { kind: 'ok'; record: OtpRecord }
  | { kind: 'missing' }
  | { kind: 'expired' }
  | { kind: 'locked' };

export type CreateResult = 'ok' | 'email_taken' | 'codename_taken';

export interface Store {
  getInfluencer(influencerId: string): Promise<InfluencerRecord | null>;
  getInfluencerByEmail(emailNorm: string): Promise<InfluencerRecord | null>;
  isCodenameTaken(codenameNorm: string): Promise<boolean>;
  /** Writes the profile, its email and codename uniqueness guards, and the first subscription atomically. */
  createInfluencer(influencer: InfluencerRecord, subscription: SubscriptionRecord): Promise<CreateResult>;
  /** Replaces the profile; when the codename changed, swaps the uniqueness guard atomically. */
  updateInfluencer(influencer: InfluencerRecord, previousCodenameNorm: string): Promise<'ok' | 'codename_taken'>;

  getIdea(ideaId: string): Promise<IdeaRecord | null>;
  putIdeaIfAbsent(idea: IdeaRecord): Promise<boolean>;

  getSubscription(influencerId: string, ideaId: string): Promise<SubscriptionRecord | null>;
  /** Every idea this influencer is subscribed to. */
  listSubscriptions(influencerId: string): Promise<SubscriptionRecord[]>;
  putSubscription(subscription: SubscriptionRecord): Promise<void>;
  listDirectInfluencers(ideaId: string, convincerId: string): Promise<SubscriptionRecord[]>;

  listObjections(influencerId: string, ideaId: string): Promise<ObjectionRecord[]>;
  getObjection(influencerId: string, ideaId: string, objectionId: string): Promise<ObjectionRecord | null>;
  putObjection(objection: ObjectionRecord): Promise<void>;
  deleteObjection(influencerId: string, ideaId: string, objectionId: string): Promise<void>;

  getOtp(emailNorm: string): Promise<OtpRecord | null>;
  putOtp(otp: OtpRecord): Promise<void>;
  deleteOtp(emailNorm: string): Promise<void>;
  /** Atomically spends one attempt if the code is live and under the cap. */
  consumeOtpAttempt(emailNorm: string, maxAttempts: number, nowSeconds: number): Promise<OtpAttempt>;

  putSession(session: SessionRecord): Promise<void>;
  getSession(tokenHash: string): Promise<SessionRecord | null>;
  touchSession(tokenHash: string, lastSeenAt: number, expiresAt: number): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
}
