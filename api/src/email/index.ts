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

export interface Mailer {
  /** Resolves true when the message was handed to the transport. */
  send(mail: Mail): Promise<boolean>;
}

export class LogMailer implements Mailer {
  readonly sent: Mail[] = [];

  constructor(private readonly log: (line: string) => void = (l) => console.log(l)) {}

  async send(mail: Mail) {
    this.sent.push(mail);
    this.log(`[mail] to: ${mail.to}\n[mail] subject: ${mail.subject}\n${mail.text}`);
    return true;
  }
}

export class SesMailer implements Mailer {
  constructor(
    private readonly from: string,
    private readonly configurationSet: string | undefined,
    private readonly client: SESv2Client = new SESv2Client({}),
  ) {}

  async send(mail: Mail) {
    try {
      await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.from,
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
      return true;
    } catch (e) {
      // The address is deliberately not logged; the caller reports the failure.
      console.error('ses send failed', { subject: mail.subject, error: (e as Error).name });
      return false;
    }
  }
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

export function invitationMail(to: string, convincerCodename: string, ideaName: string, baseUrl: string): Mail {
  const loginUrl = `${baseUrl.replace(/\/$/, '')}/login`;
  const text = [
    `${convincerCodename} convinced you to become an influencer for the idea "${ideaName}" on InfluencerTrees.`,
    `Sign in at ${loginUrl} using this exact email address: ${to}`,
    `There is no password. Each time you sign in, a one-time code is emailed to you.`,
  ].join('\n\n');
  const html = wrap([
    `${escape(convincerCodename)} convinced you to become an influencer for the idea "<strong>${escape(ideaName)}</strong>" on InfluencerTrees.`,
    `Sign in at <a href="${escape(loginUrl)}">${escape(loginUrl)}</a> using this exact email address: <strong>${escape(to)}</strong>`,
    `There is no password. Each time you sign in, a one-time code is emailed to you.`,
  ]);
  return { to, subject: `${convincerCodename} invited you to help advance ${ideaName}`, text, html };
}
