// Home. Everything about the signed-in influencer's place in the tree and the
// three ways forward: intake, survey (coming soon) and the objection notes.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import type { PersonCard, ResendResponse } from '@inftrees/shared';
import { api, errorMessage } from '../api';
import { Avatar } from '../components/Avatar';
import { Notice, noticeFromState, type NoticeData } from '../components/Notice';
import { ObjectionsSection } from '../components/ObjectionsSection';
import { PersonCardView } from '../components/PersonCardView';
import { districtLabel, formatDate, stateName } from '../lib/format';
import { usePageTitle } from '../lib/hooks';
import { useMe } from '../session';

type ResendState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'failed'; message: string };

export function ConvincePage() {
  const me = useMe();
  const { profile, idea, subscription, convincer, influencers, counts } = me;
  usePageTitle(idea.name);

  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<NoticeData | null>(() => noticeFromState(location.state));
  const [resend, setResend] = useState<Record<string, ResendState>>({});

  // A notice handed over by another page lives in history state; clear it
  // once read so a reload does not announce it a second time.
  useEffect(() => {
    if (noticeFromState(location.state)) navigate(location.pathname, { replace: true, state: null });
  }, []);

  async function resendInvitation(person: PersonCard) {
    setResend((prev) => ({ ...prev, [person.influencerId]: { kind: 'sending' } }));
    try {
      const r = await api.post<ResendResponse>(
        `/api/ideas/${encodeURIComponent(idea.ideaId)}/influencers/${encodeURIComponent(person.influencerId)}/resend`,
      );
      setResend((prev) => ({
        ...prev,
        [person.influencerId]: r.emailSent ? { kind: 'sent' } : { kind: 'failed', message: 'The email failed to send. Try again in a moment.' },
      }));
    } catch (e) {
      setResend((prev) => ({ ...prev, [person.influencerId]: { kind: 'failed', message: errorMessage(e) } }));
    }
  }

  const since = subscription.activatedAt ?? subscription.invitedAt ?? profile.createdAt;
  const state = stateName(profile.state);

  return (
    <div className="page stack">
      {notice ? (
        <Notice kind={notice.kind} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      ) : null}

      <header className="page-header">
        <h1 className="h1">{idea.name}</h1>
        {idea.description ? <p className="lede">{idea.description}</p> : null}
        <p className="muted">Content for this idea is coming soon.</p>
        <button type="button" className="btn btn--ghost" disabled aria-disabled="true">
          Tree view (coming soon)
        </button>
      </header>

      <section className="section" aria-labelledby="about-you">
        <h2 id="about-you" className="h2">
          About you
        </h2>
        <div className="card about">
          <Avatar avatarId={profile.avatarId} size={64} />
          <div className="about__body">
            <p className="about__name">{profile.codename}</p>
            <p className="about__meta">
              {state ?? 'State unknown'}
              {profile.district ? ` · ${districtLabel(profile.district)}` : ''}
            </p>
            <p className="about__meta">Influencer since {formatDate(since)}</p>
            <p className="small muted">Influencer id {profile.influencerId}</p>
            <Link to="/profile">Edit profile</Link>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="convinced-by">
        <h2 id="convinced-by" className="h2">
          Who convinced you
        </h2>
        {convincer ? <PersonCardView person={convincer} /> : <p>You are the founding influencer of this idea.</p>}
      </section>

      <section className="section" aria-labelledby="your-influencers">
        <h2 id="your-influencers" className="h2">
          Influencers you've convinced ({counts.active} active, {counts.invited} invited)
        </h2>
        {influencers.length === 0 ? (
          <p className="muted">Nobody yet. When you convince someone, use Influencer intake below.</p>
        ) : (
          <ul className="card-list">
            {influencers.map((p) => {
              const rs = resend[p.influencerId] ?? { kind: 'idle' };
              return (
                <li key={p.influencerId}>
                  <PersonCardView
                    person={p}
                    actions={
                      p.status === 'invited' ? (
                        <div className="btn-row">
                          <button
                            type="button"
                            className="btn btn--small"
                            onClick={() => resendInvitation(p)}
                            disabled={rs.kind === 'sending'}
                          >
                            {rs.kind === 'sending' ? 'Sending…' : 'Resend invitation'}
                          </button>
                          {rs.kind === 'sent' ? (
                            <span className="success" role="status">
                              Sent
                            </span>
                          ) : null}
                          {rs.kind === 'failed' ? (
                            <span className="error" role="alert">
                              {rs.message}
                            </span>
                          ) : null}
                        </div>
                      ) : null
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section actions" aria-labelledby="next-steps">
        <h2 id="next-steps" className="h2">
          Next steps
        </h2>
        <div className="card stack">
          <Link to="/intake" className="btn btn--primary btn--block">
            Influencer intake
          </Link>
          <div className="btn-row">
            <button type="button" className="btn btn--block" disabled aria-disabled="true">
              Survey a prospect
            </button>
            <span className="muted small">coming soon</span>
          </div>
          <ObjectionsSection ideaId={idea.ideaId} />
        </div>
      </section>
    </div>
  );
}
