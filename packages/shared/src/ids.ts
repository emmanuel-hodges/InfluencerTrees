// Identifier formats shared by the API and the site.
//
// Influencer and idea IDs are eight random digits rendered NNNN-NNNN, which
// is the shape the product spec uses for the originator's convincer sentinel.
// The sentinel is reserved: no influencer is ever issued it.
export const ID_PATTERN = /^\d{4}-\d{4}$/;
export const ORIGIN_CONVINCER_ID = '0000-0000';

/** Formats eight digits as NNNN-NNNN. */
export function formatId(digits: string): string {
  if (!/^\d{8}$/.test(digits)) throw new Error('an id needs exactly eight digits');
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

/** Draws a random NNNN-NNNN id; never the reserved sentinel. */
export function randomId(randomInt: (maxExclusive: number) => number): string {
  for (;;) {
    let digits = '';
    for (let i = 0; i < 8; i += 1) digits += String(randomInt(10));
    const id = formatId(digits);
    if (id !== ORIGIN_CONVINCER_ID) return id;
  }
}
