import type { ReactNode } from 'react';
import type { PersonCard } from '@inftrees/shared';
import { formatPhone, stateName } from '../lib/format';
import { Avatar } from './Avatar';

interface Props {
  person: PersonCard;
  /** Rendered under the details, e.g. a Resend button. */
  actions?: ReactNode;
}

export function PersonCardView({ person, actions }: Props) {
  const state = stateName(person.state);
  const phone = formatPhone(person.phone);
  const active = person.status === 'active';
  return (
    <div className="card person-card">
      <Avatar avatarId={person.avatarId} size={48} />
      <div className="person-card__body">
        <div className="person-card__head">
          <span className="person-card__name">{person.codename}</span>
          <span className={`badge badge--${person.status}`}>{active ? 'Active' : 'Invited'}</span>
        </div>
        <p className="person-card__meta">{state ?? 'State unknown'}</p>
        {person.email ? (
          <p className="person-card__meta">
            <a href={`mailto:${person.email}`}>{person.email}</a>
          </p>
        ) : null}
        {phone ? (
          <p className="person-card__meta">
            <a href={`tel:${person.phone}`}>{phone}</a>
          </p>
        ) : null}
        {actions ? <div className="person-card__actions">{actions}</div> : null}
      </div>
    </div>
  );
}
