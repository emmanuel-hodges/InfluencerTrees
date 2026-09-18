import { describe, expect, it } from 'vitest';
import { districtsFor, generateCodename, intakeBody, normalizeEmail, phoneSchema, randomId, votingSchema } from './index.js';

const seq = (values: number[]) => {
  let i = 0;
  return (max: number) => values[i++ % values.length]! % max;
};

describe('schemas', () => {
  it('normalizes email for lookup only', () => {
    expect(normalizeEmail('  Jane.Doe@Example.COM ')).toBe('jane.doe@example.com');
  });

  it('stores phones as E.164 and accepts blanks as null', () => {
    expect(phoneSchema.parse('(415) 555-0100')).toBe('+14155550100');
    expect(phoneSchema.parse('1-415-555-0100')).toBe('+14155550100');
    expect(phoneSchema.parse('')).toBeNull();
    expect(() => phoneSchema.parse('555-0100')).toThrow();
  });

  it('requires the mail-in ballot answer only when voting by mail', () => {
    expect(votingSchema.safeParse({ registered: 'yes', method: 'mail', hasMailBallot: null }).success).toBe(false);
    expect(votingSchema.safeParse({ registered: 'yes', method: 'mail', hasMailBallot: 'no' }).success).toBe(true);
    expect(votingSchema.safeParse({ registered: 'not_sure', method: 'early', hasMailBallot: null }).success).toBe(true);
  });

  it('checks the district against the state', () => {
    const base = {
      email: 'a@b.co',
      codename: 'Amber Falcon',
      avatarId: 'thumbs:abcdefgh12345678',
      zip: null,
      phone: null,
      voting: { registered: 'yes', method: 'election_day', hasMailBallot: null },
    };
    expect(intakeBody.safeParse({ ...base, state: 'CA', district: 'CA-12' }).success).toBe(true);
    expect(intakeBody.safeParse({ ...base, state: 'CA', district: 'CA-99' }).success).toBe(false);
    expect(intakeBody.safeParse({ ...base, state: 'WY', district: 'WY-AL' }).success).toBe(true);
    expect(intakeBody.safeParse({ ...base, state: 'NY', district: 'CA-1' }).success).toBe(false);
    expect(intakeBody.safeParse({ ...base, state: null, district: null }).success).toBe(true);
  });

  it('lists districts per state', () => {
    expect(districtsFor('WY')).toEqual(['WY-AL']);
    expect(districtsFor('RI')).toEqual(['RI-1', 'RI-2']);
    expect(districtsFor('ZZ')).toEqual([]);
  });

  it('never issues the reserved sentinel id', () => {
    // Eight zeros first, which is the sentinel, so the generator must draw again.
    expect(randomId(seq([0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]))).toBe('1234-5678');
  });

  it('generates codenames in the expected shape', () => {
    expect(generateCodename(seq([0]))).toBe('Amber Albatross');
    expect(generateCodename(seq([0, 0, 7]), true)).toBe('Amber Albatross 07');
  });
});
