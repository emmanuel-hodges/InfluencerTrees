// Passwordless sign-in: ask for an email, then for the six-digit code that was
// sent to it. request-code always answers { ok: true } so the page never
// learns (or reveals) whether an address is known.
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { requestCodeBody, verifyBody, type VerifyResponse } from '@inftrees/shared';
import { api, ApiRequestError, errorMessage } from '../api';
import { describedBy, Field } from '../components/Field';
import { Notice } from '../components/Notice';
import { usePageTitle } from '../lib/hooks';
import { fieldErrorsFrom, type FieldErrors } from '../lib/validation';
import { useSession } from '../session';

const RESEND_COOLDOWN_S = 30;

type Step = { kind: 'email' } | { kind: 'code'; email: string; sentAt: number };

const EMAIL_HINT =
  'Only people who have been invited by an influencer can sign in. Use the exact address your invitation was sent to.';

function verifyMessage(e: unknown): string {
  if (e instanceof ApiRequestError) {
    if (e.error === 'invalid_code') return "That code didn't match";
    if (e.error === 'expired_code') return 'That code has expired; send a new one';
    if (e.error === 'too_many_attempts') return 'Too many attempts. Send a new code and try again.';
  }
  return errorMessage(e);
}

export function LoginPage() {
  usePageTitle('Sign in');
  const navigate = useNavigate();
  const { refresh } = useSession();
  const id = useId();
  const emailId = `${id}-email`;
  const codeId = `${id}-code`;

  const [step, setStep] = useState<Step>({ kind: 'email' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second while the resend cooldown runs.
  useEffect(() => {
    if (step.kind !== 'code') return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [step]);

  const cooldownLeft = step.kind === 'code' ? Math.max(0, RESEND_COOLDOWN_S - Math.floor((now - step.sentAt) / 1000)) : 0;

  async function sendCode(address: string): Promise<boolean> {
    setBusy(true);
    setErrors({});
    try {
      await api.post<{ ok: true }>('/api/auth/request-code', { email: address });
      return true;
    } catch (e) {
      setErrors({ _form: errorMessage(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onRequestCode(e: FormEvent) {
    e.preventDefault();
    const parsed = requestCodeBody.safeParse({ email });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    if (await sendCode(parsed.data.email)) {
      setEmail(parsed.data.email);
      setCode('');
      setNotice(null);
      setStep({ kind: 'code', email: parsed.data.email, sentAt: Date.now() });
      setNow(Date.now());
    }
  }

  async function onResend() {
    if (step.kind !== 'code' || cooldownLeft > 0) return;
    if (await sendCode(step.email)) {
      setNotice('A new code is on its way.');
      setCode('');
      setStep({ kind: 'code', email: step.email, sentAt: Date.now() });
      setNow(Date.now());
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (step.kind !== 'code') return;
    const parsed = verifyBody.safeParse({ email: step.email, code });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const result = await api.post<VerifyResponse>('/api/auth/verify', parsed.data);
      await refresh();
      navigate(result.onboardingComplete ? '/convince' : '/welcome', { replace: true });
    } catch (err) {
      setErrors({ _form: verifyMessage(err) });
      setBusy(false);
    }
  }

  function useDifferentEmail() {
    setStep({ kind: 'email' });
    setCode('');
    setErrors({});
    setNotice(null);
  }

  return (
    <div className="login">
      <div className="login__card card">
        <h1 className="login__brand">InfluencerTrees</h1>

        {step.kind === 'email' ? (
          <form className="stack" onSubmit={onRequestCode} noValidate>
            <h2 className="h2">Sign in</h2>
            <Field id={emailId} label="Email" hint={EMAIL_HINT} error={errors.email}>
              <input
                id={emailId}
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
                aria-describedby={describedBy(emailId, { hint: EMAIL_HINT, error: errors.email })}
                disabled={busy}
              />
            </Field>
            {errors._form ? (
              <p className="error" role="alert">
                {errors._form}
              </p>
            ) : null}
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send me a code'}
            </button>
          </form>
        ) : (
          <form className="stack" onSubmit={onVerify} noValidate>
            <h2 className="h2">We sent a code to {step.email}</h2>
            {notice ? <Notice kind="info">{notice}</Notice> : null}
            <Field id={codeId} label="Six-digit code" error={errors.code}>
              <input
                id={codeId}
                className="input input--code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                required
                aria-describedby={describedBy(codeId, { error: errors.code })}
                disabled={busy}
              />
            </Field>
            {errors._form ? (
              <p className="error" role="alert">
                {errors._form}
              </p>
            ) : null}
            <div className="btn-row">
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? 'Checking…' : 'Verify'}
              </button>
              <button type="button" className="btn" onClick={onResend} disabled={busy || cooldownLeft > 0}>
                {cooldownLeft > 0 ? `Send a new code (${cooldownLeft}s)` : 'Send a new code'}
              </button>
            </div>
            <p>
              <button type="button" className="link-button" onClick={useDifferentEmail} disabled={busy}>
                Use a different email
              </button>
            </p>
          </form>
        )}
      </div>
      <nav className="login__links" aria-label="About this site">
        <Link to="/about">About</Link>
        <Link to="/contact">Contact us</Link>
      </nav>
    </div>
  );
}
