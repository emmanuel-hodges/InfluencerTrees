// DynamoDB single-table store. One table, generic pk/sk keys, one GSI for
// "who did X convince". Uniqueness of emails and codenames is a guard item
// written in the same transaction as the profile, so it can never drift.
//
//   INF#<id>          PROFILE            influencer
//   EMAIL#<norm>      INF                { influencerId }   uniqueness + login lookup
//   CODENAME#<norm>   INF                { influencerId }   uniqueness
//   INF#<id>          SUB#<ideaId>       subscription; gsi1 = IDEA#<ideaId>#CONV#<convincerId> / INF#<id>
//   IDEA#<ideaId>     META               idea
//   INF#<id>          OBJ#<ideaId>#<id>  objection note
//   OTP#<norm>        CODE               one-time code (TTL expiresAt)
//   SESSION#<hash>    S                  session (TTL expiresAt)
import {
  ConditionalCheckFailedException, DynamoDBClient, TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  CreateResult, IdeaRecord, InfluencerRecord, ObjectionRecord, OtpAttempt, OtpRecord, SessionRecord, Store,
  SubscriptionRecord,
} from './types.js';

type Key = { pk: string; sk: string };

const keys = {
  influencer: (id: string): Key => ({ pk: `INF#${id}`, sk: 'PROFILE' }),
  email: (norm: string): Key => ({ pk: `EMAIL#${norm}`, sk: 'INF' }),
  codename: (norm: string): Key => ({ pk: `CODENAME#${norm}`, sk: 'INF' }),
  idea: (id: string): Key => ({ pk: `IDEA#${id}`, sk: 'META' }),
  subscription: (infId: string, ideaId: string): Key => ({ pk: `INF#${infId}`, sk: `SUB#${ideaId}` }),
  objection: (infId: string, ideaId: string, objId: string): Key => ({ pk: `INF#${infId}`, sk: `OBJ#${ideaId}#${objId}` }),
  otp: (norm: string): Key => ({ pk: `OTP#${norm}`, sk: 'CODE' }),
  session: (hash: string): Key => ({ pk: `SESSION#${hash}`, sk: 'S' }),
};

const META = new Set(['pk', 'sk', 'gsi1pk', 'gsi1sk', 'type']);

function strip<T>(item: Record<string, unknown> | undefined): T | null {
  if (!item) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) if (!META.has(k)) out[k] = v;
  return out as T;
}

function cancelledIndex(e: unknown): number {
  if (e instanceof TransactionCanceledException && e.CancellationReasons) {
    return e.CancellationReasons.findIndex((r) => r.Code === 'ConditionalCheckFailed');
  }
  return -1;
}

export interface DynamoStoreOptions {
  tableName: string;
  endpoint?: string;
  client?: DynamoDBDocumentClient;
}

export class DynamoStore implements Store {
  private readonly table: string;
  private readonly db: DynamoDBDocumentClient;

  constructor(opts: DynamoStoreOptions) {
    this.table = opts.tableName;
    this.db =
      opts.client ??
      DynamoDBDocumentClient.from(new DynamoDBClient(opts.endpoint ? { endpoint: opts.endpoint } : {}), {
        marshallOptions: { removeUndefinedValues: true },
      });
  }

  private async get<T>(key: Key): Promise<T | null> {
    const r = await this.db.send(new GetCommand({ TableName: this.table, Key: key }));
    return strip<T>(r.Item);
  }

  private async put(item: Record<string, unknown>): Promise<void> {
    await this.db.send(new PutCommand({ TableName: this.table, Item: item }));
  }

  private subscriptionItem(sub: SubscriptionRecord) {
    return {
      ...keys.subscription(sub.influencerId, sub.ideaId),
      gsi1pk: `IDEA#${sub.ideaId}#CONV#${sub.convincerId}`,
      gsi1sk: `INF#${sub.influencerId}`,
      type: 'subscription',
      ...sub,
    };
  }

  async getInfluencer(id: string) {
    return this.get<InfluencerRecord>(keys.influencer(id));
  }

  async getInfluencerByEmail(emailNorm: string) {
    const guard = await this.get<{ influencerId: string }>(keys.email(emailNorm));
    return guard ? this.getInfluencer(guard.influencerId) : null;
  }

  async isCodenameTaken(codenameNorm: string) {
    return (await this.get(keys.codename(codenameNorm))) !== null;
  }

  async createInfluencer(inf: InfluencerRecord, sub: SubscriptionRecord): Promise<CreateResult> {
    const guard = { ConditionExpression: 'attribute_not_exists(pk)', TableName: this.table };
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { ...guard, Item: { ...keys.influencer(inf.influencerId), type: 'influencer', ...inf } } },
            { Put: { ...guard, Item: { ...keys.email(inf.emailNorm), type: 'email', influencerId: inf.influencerId } } },
            { Put: { ...guard, Item: { ...keys.codename(inf.codenameNorm), type: 'codename', influencerId: inf.influencerId } } },
            { Put: { ...guard, Item: this.subscriptionItem(sub) } },
          ],
        }),
      );
      return 'ok';
    } catch (e) {
      const i = cancelledIndex(e);
      if (i === 1) return 'email_taken';
      if (i === 2) return 'codename_taken';
      throw e;
    }
  }

  async updateInfluencer(inf: InfluencerRecord, previousCodenameNorm: string) {
    const item = { ...keys.influencer(inf.influencerId), type: 'influencer', ...inf };
    if (inf.codenameNorm === previousCodenameNorm) {
      await this.put(item);
      return 'ok' as const;
    }
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                ConditionExpression: 'attribute_not_exists(pk)',
                Item: { ...keys.codename(inf.codenameNorm), type: 'codename', influencerId: inf.influencerId },
              },
            },
            { Delete: { TableName: this.table, Key: keys.codename(previousCodenameNorm) } },
            { Put: { TableName: this.table, Item: item } },
          ],
        }),
      );
      return 'ok' as const;
    } catch (e) {
      if (cancelledIndex(e) === 0) return 'codename_taken' as const;
      throw e;
    }
  }

  async getIdea(ideaId: string) {
    return this.get<IdeaRecord>(keys.idea(ideaId));
  }

  async putIdeaIfAbsent(idea: IdeaRecord) {
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
          Item: { ...keys.idea(idea.ideaId), type: 'idea', ...idea },
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return false;
      throw e;
    }
  }

  async getSubscription(influencerId: string, ideaId: string) {
    return this.get<SubscriptionRecord>(keys.subscription(influencerId, ideaId));
  }

  async listSubscriptions(influencerId: string) {
    const r = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': `INF#${influencerId}`, ':prefix': 'SUB#' },
      }),
    );
    return (r.Items ?? []).map((i) => strip<SubscriptionRecord>(i)!);
  }

  async putSubscription(sub: SubscriptionRecord) {
    await this.put(this.subscriptionItem(sub));
  }

  async listDirectInfluencers(ideaId: string, convincerId: string) {
    const r = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :g',
        ExpressionAttributeValues: { ':g': `IDEA#${ideaId}#CONV#${convincerId}` },
      }),
    );
    return (r.Items ?? []).map((i) => strip<SubscriptionRecord>(i)!);
  }

  async listObjections(influencerId: string, ideaId: string) {
    const r = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': `INF#${influencerId}`, ':prefix': `OBJ#${ideaId}#` },
      }),
    );
    return (r.Items ?? []).map((i) => strip<ObjectionRecord>(i)!);
  }

  async getObjection(influencerId: string, ideaId: string, objectionId: string) {
    return this.get<ObjectionRecord>(keys.objection(influencerId, ideaId, objectionId));
  }

  async putObjection(o: ObjectionRecord) {
    await this.put({ ...keys.objection(o.influencerId, o.ideaId, o.objectionId), type: 'objection', ...o });
  }

  async deleteObjection(influencerId: string, ideaId: string, objectionId: string) {
    await this.db.send(new DeleteCommand({ TableName: this.table, Key: keys.objection(influencerId, ideaId, objectionId) }));
  }

  async getOtp(emailNorm: string) {
    return this.get<OtpRecord>(keys.otp(emailNorm));
  }

  async putOtp(otp: OtpRecord) {
    await this.put({ ...keys.otp(otp.emailNorm), type: 'otp', ...otp });
  }

  async deleteOtp(emailNorm: string) {
    await this.db.send(new DeleteCommand({ TableName: this.table, Key: keys.otp(emailNorm) }));
  }

  async consumeOtpAttempt(emailNorm: string, maxAttempts: number, nowSeconds: number): Promise<OtpAttempt> {
    try {
      const r = await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: keys.otp(emailNorm),
          UpdateExpression: 'SET attempts = attempts + :one',
          ConditionExpression: 'attribute_exists(pk) AND attempts < :max AND expiresAt > :now',
          ExpressionAttributeValues: { ':one': 1, ':max': maxAttempts, ':now': nowSeconds },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return { kind: 'ok', record: strip<OtpRecord>(r.Attributes)! };
    } catch (e) {
      if (!(e instanceof ConditionalCheckFailedException)) throw e;
      const current = await this.getOtp(emailNorm);
      if (!current) return { kind: 'missing' };
      if (current.expiresAt <= nowSeconds) return { kind: 'expired' };
      return { kind: 'locked' };
    }
  }

  async putSession(s: SessionRecord) {
    await this.put({ ...keys.session(s.tokenHash), type: 'session', ...s });
  }

  async getSession(tokenHash: string) {
    return this.get<SessionRecord>(keys.session(tokenHash));
  }

  async touchSession(tokenHash: string, lastSeenAt: number, expiresAt: number) {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: keys.session(tokenHash),
          UpdateExpression: 'SET lastSeenAt = :seen, expiresAt = :exp',
          ConditionExpression: 'attribute_exists(pk)',
          ExpressionAttributeValues: { ':seen': lastSeenAt, ':exp': expiresAt },
        }),
      );
    } catch (e) {
      if (!(e instanceof ConditionalCheckFailedException)) throw e;
    }
  }

  async deleteSession(tokenHash: string) {
    await this.db.send(new DeleteCommand({ TableName: this.table, Key: keys.session(tokenHash) }));
  }
}
