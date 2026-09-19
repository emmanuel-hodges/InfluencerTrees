// The SES transport's verdicts, against a fake client: the sandbox's refusal
// of an unverified recipient is told apart from other failures, and no
// address reaches the log.
import type { SESv2Client } from '@aws-sdk/client-sesv2';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifySesError, loginCodeMail, redactAddresses, SesMailer } from './index.js';

const sandboxRejection = (identity: string) =>
  Object.assign(
    new Error(`Email address is not verified. The following identities failed the check in region US-EAST-1: ${identity}`),
    { name: 'MessageRejected' },
  );

function sesThat(result: 'accepts' | Error) {
  const send = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return {};
  });
  const client = { send } as unknown as SESv2Client;
  return { mailer: new SesMailer('InfluencerTrees <no-reply@example.com>', 'inftrees-test', client), send };
}

const mail = loginCodeMail('someone@example.com', '123456', 10);

describe('SesMailer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports the sandbox refusing the recipient as unverified_recipient and logs no address', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { mailer } = sesThat(sandboxRejection('Someone@Example.com'));
    expect(await mailer.send(mail)).toBe('unverified_recipient');
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain('not verified');
    expect(logged).toContain('MessageRejected');
    expect(logged).not.toContain('example.com');
  });

  it('reports every other refusal as failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { mailer } = sesThat(Object.assign(new Error('Rate exceeded'), { name: 'TooManyRequestsException' }));
    expect(await mailer.send(mail)).toBe('failed');
    // A rejection naming some other identity is not about this recipient.
    expect(classifySesError(sandboxRejection('other@example.com'), 'someone@example.com')).toBe('failed');
  });

  it('reports sent once SES accepts the message', async () => {
    const { mailer, send } = sesThat('accepts');
    expect(await mailer.send(mail)).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('redactAddresses', () => {
  it('replaces every address and keeps the rest of the message', () => {
    expect(redactAddresses('failed the check: a@b.co, First Last <c.d@e.org>')).toBe(
      'failed the check: <address>, First Last <<address>>',
    );
  });
});
