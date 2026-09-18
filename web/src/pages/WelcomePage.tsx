// Intake 2 of 2, shown once on the new influencer's first login. Everything
// is preloaded from what the convincer entered; the person confirms it and
// chooses what to share.
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { onboardingBody, type MeResponse, type Prefs } from '@inftrees/shared';
import { ApiRequestError, api, errorMessage } from '../api';
import { IdentityPicker, type Identity } from '../components/IdentityPicker';
import { personBodyFrom, PersonForm, personValuesFromProfile, type PersonValues } from '../components/PersonForm';
import { PrefsForm } from '../components/PrefsForm';
import { usePageTitle } from '../lib/hooks';
import { fieldErrorsFrom, FORM_ERROR, type FieldErrors } from '../lib/validation';
import { useMe, useSession } from '../session';

export function WelcomePage() {
  usePageTitle('Welcome');
  const me = useMe();
  const { refresh } = useSession();
  const navigate = useNavigate();

  const [identity, setIdentity] = useState<Identity>({ codename: me.profile.codename, avatarId: me.profile.avatarId });
  const [person, setPerson] = useState<PersonValues>(() => personValuesFromProfile(me.profile));
  const [prefs, setPrefs] = useState<Prefs>(me.subscription.prefs);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = onboardingBody.safeParse({ ...identity, ...personBodyFrom(person), prefs });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await api.post<MeResponse>('/api/me/onboarding', parsed.data);
      await refresh();
      navigate('/convince', { replace: true, state: { notice: { kind: 'success', text: 'Welcome aboard. Your profile is set.' } } });
    } catch (err) {
      const next: FieldErrors = { [FORM_ERROR]: errorMessage(err) };
      if (err instanceof ApiRequestError && err.error === 'codename_taken') next.codename = err.message;
      setErrors(next);
      setSubmitting(false);
    }
  }

  return (
    <div className="page stack">
      <header className="page-header">
        <p className="eyebrow">Intake 2 of 2</p>
        <h1 className="h1">Welcome to {me.idea.name}</h1>
        <p className="lede">Welcome. Confirm how you appear to others, check your answers, and choose what to share.</p>
      </header>

      <form className="card stack" onSubmit={onSubmit} noValidate>
        <h2 className="h3">How you appear</h2>
        <IdentityPicker
          value={identity}
          onChange={(patch) => setIdentity((prev) => ({ ...prev, ...patch }))}
          errors={errors}
          disabled={submitting}
        />

        <h2 className="h3">Where you vote</h2>
        <PersonForm value={person} onChange={(patch) => setPerson((prev) => ({ ...prev, ...patch }))} errors={errors} disabled={submitting} />

        <h2 className="h3">What to share</h2>
        <PrefsForm
          value={prefs}
          onChange={(patch) => setPrefs((prev) => ({ ...prev, ...patch }))}
          errors={prefixed(errors, 'prefs.')}
          disabled={submitting}
        />

        {errors[FORM_ERROR] ? (
          <p className="error" role="alert">
            {errors[FORM_ERROR]}
          </p>
        ) : null}
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Finish'}
        </button>
      </form>
    </div>
  );
}

/** Strips a path prefix so a nested object's issues line up with its form's field names. */
function prefixed(errors: FieldErrors, prefix: string): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, message] of Object.entries(errors)) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = message;
  }
  return out;
}
