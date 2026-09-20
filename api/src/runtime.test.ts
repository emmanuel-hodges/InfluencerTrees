// The wiring's one rule: real sending needs a reply-to address, or nothing
// starts. The address itself is configuration; its presence is not.
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { LogMailer, SesMailer } from './email/index.js';
import { makeMailer } from './runtime.js';

const base = { STORE: 'memory', PUBLIC_BASE_URL: 'http://localhost:5173' };

describe('makeMailer', () => {
  it('logs locally, with or without a contact address', () => {
    expect(makeMailer(loadConfig({ ...base, EMAIL_MODE: 'log' }))).toBeInstanceOf(LogMailer);
  });

  it('refuses to send for real without a reply-to address', () => {
    expect(() => makeMailer(loadConfig({ ...base, EMAIL_MODE: 'ses', SES_FROM: 'no-reply@example.com' }))).toThrow(/CONTACT_EMAIL/);
  });

  it('sends through SES once a reply-to address is set', () => {
    const config = loadConfig({ ...base, EMAIL_MODE: 'ses', SES_FROM: 'no-reply@example.com', CONTACT_EMAIL: 'support@example.com' });
    expect(makeMailer(config)).toBeInstanceOf(SesMailer);
  });
});
