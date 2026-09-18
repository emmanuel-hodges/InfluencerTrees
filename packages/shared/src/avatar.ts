// Avatars are generated on the client from a seed with DiceBear, so an
// AvatarId is "<style>:<seed>" and nothing is stored or fetched. Regenerating
// is a new seed. One style for now; the prefix leaves room for more.

export const AVATAR_STYLE = 'thumbs';
export const AVATAR_ID_PATTERN = /^thumbs:[a-z0-9]{8,32}$/;

export function newAvatarId(randomInt: (maxExclusive: number) => number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let seed = '';
  for (let i = 0; i < 16; i += 1) seed += alphabet[randomInt(alphabet.length)];
  return `${AVATAR_STYLE}:${seed}`;
}

export function avatarSeed(avatarId: string): string {
  const idx = avatarId.indexOf(':');
  return idx === -1 ? avatarId : avatarId.slice(idx + 1);
}
