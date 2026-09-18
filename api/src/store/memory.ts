// In-memory store for tests and quick local runs. Same semantics as the
// DynamoDB store, including the uniqueness guards, so the test suite
// exercises the real flows without a network.
import type {
  CreateResult, IdeaRecord, InfluencerRecord, ObjectionRecord, OtpAttempt, OtpRecord, SessionRecord, Store,
  SubscriptionRecord,
} from './types.js';

const clone = <T>(v: T): T => structuredClone(v);

export class MemoryStore implements Store {
  private influencers = new Map<string, InfluencerRecord>();
  private emails = new Map<string, string>();
  private codenames = new Map<string, string>();
  private ideas = new Map<string, IdeaRecord>();
  private subscriptions = new Map<string, SubscriptionRecord>();
  private objections = new Map<string, ObjectionRecord>();
  private otps = new Map<string, OtpRecord>();
  private sessions = new Map<string, SessionRecord>();

  async getInfluencer(id: string) {
    const r = this.influencers.get(id);
    return r ? clone(r) : null;
  }

  async getInfluencerByEmail(emailNorm: string) {
    const id = this.emails.get(emailNorm);
    return id ? this.getInfluencer(id) : null;
  }

  async isCodenameTaken(codenameNorm: string) {
    return this.codenames.has(codenameNorm);
  }

  async createInfluencer(inf: InfluencerRecord, sub: SubscriptionRecord): Promise<CreateResult> {
    if (this.influencers.has(inf.influencerId)) throw new Error('duplicate influencer id');
    if (this.emails.has(inf.emailNorm)) return 'email_taken';
    if (this.codenames.has(inf.codenameNorm)) return 'codename_taken';
    this.influencers.set(inf.influencerId, clone(inf));
    this.emails.set(inf.emailNorm, inf.influencerId);
    this.codenames.set(inf.codenameNorm, inf.influencerId);
    this.subscriptions.set(`${sub.influencerId}|${sub.ideaId}`, clone(sub));
    return 'ok';
  }

  async updateInfluencer(inf: InfluencerRecord, previousCodenameNorm: string) {
    if (inf.codenameNorm !== previousCodenameNorm) {
      if (this.codenames.has(inf.codenameNorm)) return 'codename_taken' as const;
      this.codenames.delete(previousCodenameNorm);
      this.codenames.set(inf.codenameNorm, inf.influencerId);
    }
    this.influencers.set(inf.influencerId, clone(inf));
    return 'ok' as const;
  }

  async getIdea(ideaId: string) {
    const r = this.ideas.get(ideaId);
    return r ? clone(r) : null;
  }

  async putIdeaIfAbsent(idea: IdeaRecord) {
    if (this.ideas.has(idea.ideaId)) return false;
    this.ideas.set(idea.ideaId, clone(idea));
    return true;
  }

  async getSubscription(influencerId: string, ideaId: string) {
    const r = this.subscriptions.get(`${influencerId}|${ideaId}`);
    return r ? clone(r) : null;
  }

  async listSubscriptions(influencerId: string) {
    return [...this.subscriptions.values()]
      .filter((s) => s.influencerId === influencerId)
      .sort((a, b) => a.ideaId.localeCompare(b.ideaId))
      .map(clone);
  }

  async putSubscription(sub: SubscriptionRecord) {
    this.subscriptions.set(`${sub.influencerId}|${sub.ideaId}`, clone(sub));
  }

  async listDirectInfluencers(ideaId: string, convincerId: string) {
    return [...this.subscriptions.values()]
      .filter((s) => s.ideaId === ideaId && s.convincerId === convincerId)
      .sort((a, b) => a.influencerId.localeCompare(b.influencerId))
      .map(clone);
  }

  async listObjections(influencerId: string, ideaId: string) {
    return [...this.objections.values()]
      .filter((o) => o.influencerId === influencerId && o.ideaId === ideaId)
      .sort((a, b) => a.objectionId.localeCompare(b.objectionId))
      .map(clone);
  }

  async getObjection(influencerId: string, ideaId: string, objectionId: string) {
    const r = this.objections.get(`${influencerId}|${ideaId}|${objectionId}`);
    return r ? clone(r) : null;
  }

  async putObjection(o: ObjectionRecord) {
    this.objections.set(`${o.influencerId}|${o.ideaId}|${o.objectionId}`, clone(o));
  }

  async deleteObjection(influencerId: string, ideaId: string, objectionId: string) {
    this.objections.delete(`${influencerId}|${ideaId}|${objectionId}`);
  }

  async getOtp(emailNorm: string) {
    const r = this.otps.get(emailNorm);
    return r ? clone(r) : null;
  }

  async putOtp(otp: OtpRecord) {
    this.otps.set(otp.emailNorm, clone(otp));
  }

  async deleteOtp(emailNorm: string) {
    this.otps.delete(emailNorm);
  }

  async consumeOtpAttempt(emailNorm: string, maxAttempts: number, nowSeconds: number): Promise<OtpAttempt> {
    const r = this.otps.get(emailNorm);
    if (!r) return { kind: 'missing' };
    if (r.expiresAt <= nowSeconds) return { kind: 'expired' };
    if (r.attempts >= maxAttempts) return { kind: 'locked' };
    r.attempts += 1;
    return { kind: 'ok', record: clone(r) };
  }

  async putSession(s: SessionRecord) {
    this.sessions.set(s.tokenHash, clone(s));
  }

  async getSession(tokenHash: string) {
    const r = this.sessions.get(tokenHash);
    return r ? clone(r) : null;
  }

  async touchSession(tokenHash: string, lastSeenAt: number, expiresAt: number) {
    const r = this.sessions.get(tokenHash);
    if (r) Object.assign(r, { lastSeenAt, expiresAt });
  }

  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
}
