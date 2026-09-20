// Outbound mail: two messages, one interface, two transports. The log
// transport prints to the terminal (and keeps what it sent, for tests); the
// SES transport sends through the environment's verified domain identity.
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * What became of a send. `unverified_recipient` is the SES sandbox refusing
 * an address that is not a verified identity in the account, which no retry
 * can fix; `failed` is anything else and may be transient.
 */
export type SendOutcome = 'sent' | 'unverified_recipient' | 'failed';

export interface Mailer {
  /** Resolves 'sent' when the message was handed to the transport. */
  send(mail: Mail): Promise<SendOutcome>;
}

export class LogMailer implements Mailer {
  readonly sent: Mail[] = [];

  constructor(private readonly log: (line: string) => void = (l) => console.log(l)) {}

  async send(mail: Mail): Promise<SendOutcome> {
    this.sent.push(mail);
    this.log(`[mail] to: ${mail.to}\n[mail] subject: ${mail.subject}\n${mail.text}`);
    return 'sent';
  }
}

export class SesMailer implements Mailer {
  constructor(
    private readonly from: string,
    private readonly configurationSet: string | undefined,
    /** An address a person reads. From is a no-reply, so replies go here. */
    private readonly replyTo: string | undefined = undefined,
    private readonly client: SESv2Client = new SESv2Client({}),
  ) {}

  async send(mail: Mail): Promise<SendOutcome> {
    try {
      await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.from,
          ReplyToAddresses: this.replyTo ? [this.replyTo] : undefined,
          Destination: { ToAddresses: [mail.to] },
          ConfigurationSetName: this.configurationSet,
          Content: {
            Simple: {
              Subject: { Data: mail.subject, Charset: 'UTF-8' },
              Body: {
                Text: { Data: mail.text, Charset: 'UTF-8' },
                Html: { Data: mail.html, Charset: 'UTF-8' },
              },
            },
          },
        }),
      );
      return 'sent';
    } catch (e) {
      const err = e as Error;
      const outcome = classifySesError(err, mail.to);
      // Addresses stay out of the log. SES names them in its message, so the
      // message is kept with every address redacted: it is what says why.
      console.error('ses send failed', {
        subject: mail.subject,
        error: err.name,
        outcome,
        detail: redactAddresses(err.message ?? ''),
      });
      return outcome;
    }
  }
}

/**
 * The sandbox refuses an unverified recipient with MessageRejected and a
 * message that names the identities that failed. Only a rejection that names
 * this recipient counts; anything else is an ordinary failure.
 */
export function classifySesError(err: Error, to: string): SendOutcome {
  const message = err.message ?? '';
  const namesRecipient = message.toLowerCase().includes(to.trim().toLowerCase());
  if (err.name === 'MessageRejected' && /not verified/i.test(message) && namesRecipient) return 'unverified_recipient';
  return 'failed';
}

/** Every email address in `s` replaced with a placeholder. */
export function redactAddresses(s: string): string {
  return s.replace(/[^\s,;:<>()"']+@[^\s,;:<>()"']+/g, '<address>');
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

const wrap = (paragraphs: string[]) =>
  `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">` +
  paragraphs.map((p) => `<p>${p}</p>`).join('') +
  `</body></html>`;

export function loginCodeMail(to: string, code: string, minutes: number): Mail {
  const text = [
    `Your InfluencerTrees sign-in code is ${code}.`,
    `It expires in ${minutes} minutes and works once.`,
    `If you did not ask for a code, you can ignore this email.`,
  ].join('\n\n');
  const html = wrap([
    `Your InfluencerTrees sign-in code is <strong style="font-size:24px;letter-spacing:2px">${escape(code)}</strong>.`,
    `It expires in ${minutes} minutes and works once.`,
    `If you did not ask for a code, you can ignore this email.`,
  ]);
  return { to, subject: 'Your InfluencerTrees sign-in code', text, html };
}

/**
 * The one message a person receives without asking. So it says who sent it
 * and why, links the public page that explains the site and its email, and
 * says how to make sure nothing more arrives.
 */
export function invitationMail(to: string, convincerCodename: string, ideaName: string, baseUrl: string, contactEmail?: string): Mail {
  const base = baseUrl.replace(/\/$/, '');
  const loginUrl = `${base}/login`;
  const aboutUrl = `${base}/about`;
  const stop = contactEmail
    ? `If you would rather not hear from us, reply to this email or write to ${contactEmail}, and nothing more will be sent to you.`
    : `If you would rather not hear from us, reply to this email and nothing more will be sent to you.`;
  const text = [
    `${convincerCodename} convinced you to become an influencer for the idea "${ideaName}" on InfluencerTrees.`,
    `Sign in at ${loginUrl} using this exact email address: ${to}`,
    `There is no password. Each time you sign in, a one-time code is emailed to you.`,
    `What InfluencerTrees is, what it collects, and who sees it: ${aboutUrl}`,
    stop,
  ].join('\n\n');
  const html = wrap([
    `${escape(convincerCodename)} convinced you to become an influencer for the idea "<strong>${escape(ideaName)}</strong>" on InfluencerTrees.`,
    `Sign in at <a href="${escape(loginUrl)}">${escape(loginUrl)}</a> using this exact email address: <strong>${escape(to)}</strong>`,
    `There is no password. Each time you sign in, a one-time code is emailed to you.`,
    `What InfluencerTrees is, what it collects, and who sees it: <a href="${escape(aboutUrl)}">${escape(aboutUrl)}</a>`,
    escape(stop),
  ]);
  return { to, subject: `${convincerCodename} invited you to help advance ${ideaName}`, text, html };
}
