/**
 * Uniform integer in [0, maxExclusive) from crypto.getRandomValues, with
 * rejection sampling so no residue class is favoured. Matches the
 * `randomInt` callback shape the shared generators take.
 */
export function randomInt(maxExclusive: number): number {
  const RANGE = 0x1_0000_0000;
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > RANGE) {
    throw new RangeError(`randomInt: bound must be an integer in 1..2^32, got ${maxExclusive}`);
  }
  const limit = RANGE - (RANGE % maxExclusive);
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0] as number;
    if (v < limit) return v % maxExclusive;
  }
}
