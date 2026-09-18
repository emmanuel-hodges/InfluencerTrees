// Avatars are drawn client-side by DiceBear from the seed inside an avatarId;
// nothing is stored or fetched. In @dicebear/core 9 createAvatar(...) returns
// a Result whose toDataUri() is synchronous, so a module-level cache keyed by
// seed is enough to avoid regenerating the same SVG on every render.
import { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { thumbs } from '@dicebear/collection';
import { avatarSeed } from '@inftrees/shared';

const cache = new Map<string, string>();

export function avatarDataUri(avatarId: string): string {
  const seed = avatarSeed(avatarId);
  const hit = cache.get(seed);
  if (hit) return hit;
  const uri = createAvatar(thumbs, { seed, radius: 50 }).toDataUri();
  cache.set(seed, uri);
  return uri;
}

interface Props {
  avatarId: string;
  size?: number;
  /** Empty by default: the codename is always rendered right next to it. */
  alt?: string;
  className?: string;
}

export function Avatar({ avatarId, size = 48, alt = '', className }: Props) {
  const src = useMemo(() => avatarDataUri(avatarId), [avatarId]);
  return (
    <img
      className={className ? `avatar ${className}` : 'avatar'}
      src={src}
      width={size}
      height={size}
      alt={alt}
      draggable={false}
    />
  );
}
