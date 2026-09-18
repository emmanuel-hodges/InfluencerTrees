// Codename + avatar. The codename is never typed: it is drawn by the API
// (which knows which names are free) and the avatar is a fresh random seed
// generated here. Both are only saved when the surrounding form submits.
import { useId, useState } from 'react';
import { newAvatarId, type SuggestResponse } from '@inftrees/shared';
import { api, errorMessage } from '../api';
import { randomInt } from '../lib/random';
import type { FieldErrors } from '../lib/validation';
import { Avatar } from './Avatar';
import { describedBy, Field } from './Field';

export interface Identity {
  codename: string;
  avatarId: string;
}

interface Props {
  value: Identity;
  onChange: (patch: Partial<Identity>) => void;
  errors?: FieldErrors;
  disabled?: boolean;
}

export function IdentityPicker({ value, onChange, errors = {}, disabled }: Props) {
  const id = useId();
  const codenameId = `${id}-codename`;
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const hint = 'Shown to other influencers instead of a real name.';

  async function newCodename() {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const s = await api.get<SuggestResponse>('/api/codename/suggest');
      onChange({ codename: s.codename });
    } catch (e) {
      setSuggestError(errorMessage(e));
    } finally {
      setSuggesting(false);
    }
  }

  function newAvatar() {
    onChange({ avatarId: newAvatarId(randomInt) });
  }

  return (
    <div className="identity">
      <Avatar avatarId={value.avatarId} size={96} className="identity__avatar" />
      <div className="identity__fields">
        <Field id={codenameId} label="Codename" hint={hint} error={errors.codename}>
          <input
            id={codenameId}
            className="input"
            value={value.codename}
            readOnly
            aria-describedby={describedBy(codenameId, { hint, error: errors.codename })}
            placeholder={suggesting ? 'Finding one…' : ''}
          />
        </Field>
        <div className="btn-row">
          <button type="button" className="btn" onClick={newCodename} disabled={disabled || suggesting}>
            {suggesting ? 'Finding one…' : 'New codename'}
          </button>
          <button type="button" className="btn" onClick={newAvatar} disabled={disabled}>
            New avatar
          </button>
        </div>
        {suggestError ? (
          <p className="error" role="alert">
            {suggestError}
          </p>
        ) : null}
        {errors.avatarId ? (
          <p className="error" role="alert">
            {errors.avatarId}
          </p>
        ) : null}
      </div>
    </div>
  );
}
