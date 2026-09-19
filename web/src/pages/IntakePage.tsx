// Intake 1 of 2: the convincer records a person they have just convinced.
// The API creates the influencer and emails them how to sign in; they finish
// their own details on first login (Intake 2 of 2, WelcomePage).
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { intakeBody, type IntakeResponse, type SuggestResponse } from '@inftrees/shared';
import { api, ApiRequestError, errorMessage } from '../api';
import { describedBy, Field } from '../components/Field';
import { IdentityPicker, type Identity } from '../components/IdentityPicker';
import { Notice } from '../components/Notice';
import { EMPTY_PERSON, personBodyFrom, PersonForm, type PersonValues } from '../components/PersonForm';
import { usePageTitle } from '../lib/hooks';
import { invitationFailureText } from '../lib/invitation';
import { fieldErrorsFrom, FORM_ERROR, type FieldErrors } from '../lib/validation';
import { useMe, useSession } from '../session';

export function IntakePage() {
  usePageTitle('Intake 1 of 2');
  const me = useMe();
  const { refresh } = useSession();
  const navigate = useNavigate();
  const id = useId();
  const emailId = `${id}-email`;
  const confirmId = `${id}-confirm`;

  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [person, setPerson] = useState<PersonValues>(EMPTY_PERSON);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;
    api
      .get<SuggestResponse>('/api/codename/suggest')
      .then((s) => {
        if (!ignore) setIdentity({ codename: s.codename, avatarId: s.avatarId });
      })
      .catch((e: unknown) => {
        if (!ignore) setSuggestError(errorMessage(e));
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!identity) return;
    const parsed = intakeBody.safeParse({ email, ...identity, ...personBodyFrom(person) });
    const next: FieldErrors = parsed.success ? {} : fieldErrorsFrom(parsed.error);
    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      next.confirmEmail = 'The two email addresses must match';
    }
    if (!parsed.success || Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const r = await api.post<IntakeResponse>(`/api/ideas/${encodeURIComponent(me.idea.ideaId)}/intake`, parsed.data);
      // The Convince page lists influencers from the session; refresh it so
      // the new invitation is there when the page renders.
      await refresh();
      navigate('/convince', {
        state: {
          notice: r.emailSent
            ? { kind: 'success', text: `Invitation sent to ${parsed.data.email}` }
            : { kind: 'error', text: `Saved. ${invitationFailureText(r.emailFailure, parsed.data.email)}` },
        },
      });
    } catch (err) {
      const fieldErrors: FieldErrors = { [FORM_ERROR]: errorMessage(err) };
      if (err instanceof ApiRequestError) {
        if (err.error === 'email_taken' || err.error === 'self_invite') fieldErrors.email = err.message;
        if (err.error === 'codename_taken') fieldErrors.codename = err.message;
      }
      setErrors(fieldErrors);
      setSubmitting(false);
    }
  }

  return (
    <div className="page stack">
      <header className="page-header">
        <p className="eyebrow">Intake 1 of 2</p>
        <h1 className="h1">Influencer intake</h1>
        <p className="lede">Fill this in with the person you have convinced. They will get an email telling them how to sign in.</p>
      </header>

      <form className="card stack" onSubmit={onSubmit} noValidate>
        <Field id={emailId} label="Their email" error={errors.email}>
          <input
            id={emailId}
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            required
            aria-describedby={describedBy(emailId, { error: errors.email })}
            disabled={submitting}
          />
        </Field>
        <Field id={confirmId} label="Confirm their email" error={errors.confirmEmail}>
          <input
            id={confirmId}
            className="input"
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            autoComplete="off"
            required
            aria-describedby={describedBy(confirmId, { error: errors.confirmEmail })}
            disabled={submitting}
          />
        </Field>

        <h2 className="h3">How they will appear</h2>
        {identity ? (
          <IdentityPicker
            value={identity}
            onChange={(patch) => setIdentity((prev) => (prev ? { ...prev, ...patch } : prev))}
            errors={errors}
            disabled={submitting}
          />
        ) : suggestError ? (
          <Notice kind="error">Could not suggest a codename: {suggestError}</Notice>
        ) : (
          <p className="muted">Picking a codename…</p>
        )}

        <h2 className="h3">Where they vote</h2>
        <PersonForm value={person} onChange={(patch) => setPerson((prev) => ({ ...prev, ...patch }))} errors={errors} disabled={submitting} />

        {errors[FORM_ERROR] ? (
          <p className="error" role="alert">
            {errors[FORM_ERROR]}
          </p>
        ) : null}
        <div className="btn-row">
          <button type="submit" className="btn btn--primary" disabled={submitting || !identity}>
            {submitting ? 'Saving…' : 'Send invitation'}
          </button>
          <Link to="/convince" className="btn btn--ghost">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
