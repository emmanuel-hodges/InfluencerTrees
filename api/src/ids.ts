// Random values, all from the platform CSPRNG.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { generateCodename, newAvatarId, randomId } from '@inftrees/shared';

export const rand = (maxExclusive: number): number => randomInt(0, maxExclusive);

export const newInfluencerId = (): string => randomId(rand);
export const newAvatar = (): string => newAvatarId(rand);
export const newCodename = (withSuffix = false): string => generateCodename(rand, withSuffix);

/** A six-digit one-time code, zero-padded. */
export const newCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** 256 bits, URL-safe; only its hash is stored. */
export const newSessionToken = (): string => randomBytes(32).toString('base64url');

export const newSalt = (): string => randomBytes(16).toString('hex');

/** Time-ordered and unique enough for one influencer's notes. */
export const newObjectionId = (now: Date): string =>
  `${now.toISOString().replace(/[-:.TZ]/g, '')}-${randomBytes(3).toString('hex')}`;

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export function hashesMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
