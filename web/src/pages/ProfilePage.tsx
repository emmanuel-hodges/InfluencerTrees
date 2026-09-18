// Later edits: the same three forms as the welcome page, saved separately
// because they go to different endpoints (profile vs. per-idea prefs).
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { prefsBody, profileUpdateBody, type Prefs, type Profile, type Subscription } from '@inftrees/shared';
import { ApiRequestError, api, errorMessage } from '../api';
import { IdentityPicker, type Identity } from '../components/IdentityPicker';
import { Notice, type NoticeData } from '../components/Notice';
import { personBodyFrom, PersonForm, personValuesFromProfile, type PersonValues } from '../components/PersonForm';
import { PrefsForm } from '../components/PrefsForm';
import { usePageTitle } from '../lib/hooks';
import { fieldErrorsFrom, FORM_ERROR, type FieldErrors } from '../lib/validation';
import { useMe, useSession } from '../session';

export function ProfilePage() {
  usePageTitle('Profile');
  const me = useMe();
  const { refresh } = useSession();

  // --- profile form ---
  const [identity, setIdentity] = useState<Identity>({ codename: me.profile.codename, avatarId: me.profile.avatarId });
  const [person, setPerson] = useState<PersonValues>(() => personValuesFromProfile(me.profile));
  const [profileErrors, setProfileErrors] = useState<FieldErrors>({});
  const [profileNotice, setProfileNotice] = useState<NoticeData | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileNotice(null);
    const parsed = profileUpdateBody.safeParse({ ...identity, ...personBodyFrom(person) });
    if (!parsed.success) {
      setProfileErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setProfileErrors({});
    setSavingProfile(true);
    try {
      const saved = await api.put<Profile>('/api/me', parsed.data);
      setIdentity({ codename: saved.codename, avatarId: saved.avatarId });
      setPerson(personValuesFromProfile(saved));
      await refresh();
      setProfileNotice({ kind: 'success', text: 'Profile saved.' });
    } catch (err) {
      const next: FieldErrors = { [FORM_ERROR]: errorMessage(err) };
      if (err instanceof ApiRequestError && err.error === 'codename_taken') next.codename = err.message;
      setProfileErrors(next);
    } finally {
      setSavingProfile(false);
    }
  }

  // --- prefs form ---
  const [prefs, setPrefs] = useState<Prefs>(me.subscription.prefs);
  const [prefsErrors, setPrefsErrors] = useState<FieldErrors>({});
  const [prefsNotice, setPrefsNotice] = useState<NoticeData | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  async function savePrefs(e: FormEvent) {
    e.preventDefault();
    setPrefsNotice(null);
    const parsed = prefsBody.safeParse(prefs);
    if (!parsed.success) {
      setPrefsErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setPrefsErrors({});
    setSavingPrefs(true);
    try {
      const saved = await api.put<Subscription>(`/api/ideas/${encodeURIComponent(me.idea.ideaId)}/prefs`, parsed.data);
      setPrefs(saved.prefs);
      await refresh();
      setPrefsNotice({ kind: 'success', text: 'Preferences saved.' });
    } catch (err) {
      setPrefsErrors({ [FORM_ERROR]: errorMessage(err) });
    } finally {
      setSavingPrefs(false);
    }
  }

  return (
    <div className="page stack">
      <header className="page-header">
        <h1 className="h1">Profile</h1>
        <p className="lede">
          Signed in as {me.profile.email}. <Link to="/convince">Back to {me.idea.name}</Link>
        </p>
      </header>

      <form className="card stack" onSubmit={saveProfile} noValidate aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="h3">
          How you appear
        </h2>
        <IdentityPicker
          value={identity}
          onChange={(patch) => setIdentity((prev) => ({ ...prev, ...patch }))}
          errors={profileErrors}
          disabled={savingProfile}
        />
        <h2 className="h3">Where you vote</h2>
        <PersonForm
          value={person}
          onChange={(patch) => setPerson((prev) => ({ ...prev, ...patch }))}
          errors={profileErrors}
          disabled={savingProfile}
        />
        {profileErrors[FORM_ERROR] ? (
          <p className="error" role="alert">
            {profileErrors[FORM_ERROR]}
          </p>
        ) : null}
        {profileNotice ? (
          <Notice kind={profileNotice.kind} onDismiss={() => setProfileNotice(null)}>
            {profileNotice.text}
          </Notice>
        ) : null}
        <button type="submit" className="btn btn--primary" disabled={savingProfile}>
          {savingProfile ? 'Saving…' : 'Save profile'}
        </button>
      </form>

      <form className="card stack" onSubmit={savePrefs} noValidate aria-labelledby="prefs-heading">
        <h2 id="prefs-heading" className="h3">
          What to share about {me.idea.name}
        </h2>
        <PrefsForm value={prefs} onChange={(patch) => setPrefs((prev) => ({ ...prev, ...patch }))} errors={prefsErrors} disabled={savingPrefs} />
        {prefsErrors[FORM_ERROR] ? (
          <p className="error" role="alert">
            {prefsErrors[FORM_ERROR]}
          </p>
        ) : null}
        {prefsNotice ? (
          <Notice kind={prefsNotice.kind} onDismiss={() => setPrefsNotice(null)}>
            {prefsNotice.text}
          </Notice>
        ) : null}
        <button type="submit" className="btn btn--primary" disabled={savingPrefs}>
          {savingPrefs ? 'Saving…' : 'Save preferences'}
        </button>
      </form>
    </div>
  );
}
