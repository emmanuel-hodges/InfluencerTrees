// Public. What the site is, what email it sends, how to stop it, and what it
// keeps: the page every invitation links to, and the one a mail-provider
// reviewer reads. Plain facts only; when the product changes, change this.
import { Link } from 'react-router';
import { ContactAddress } from '../components/ContactAddress';
import { usePageTitle } from '../lib/hooks';
import { useSiteInfo } from '../lib/site';

export function AboutPage() {
  usePageTitle('About');
  const info = useSiteInfo();
  const sender = `no-reply@${window.location.hostname}`;

  return (
    <div className="page stack prose">
      <header className="page-header">
        <h1 className="h1">About InfluencerTrees</h1>
        <p className="lede">A site for people who convince other people of an idea, one conversation at a time.</p>
      </header>

      <section className="stack">
        <h2 className="h2">What it is</h2>
        <p>
          Someone who has been convinced of an idea becomes an influencer for it and can convince others in turn.
          InfluencerTrees records who convinced whom, so an idea grows as a tree of people who have actually talked
          to each other, not as a mailing list. The first idea on the site is “Elect Democratic US House and Senate
          Legislators”.
        </p>
        <p>
          There is no sign-up form. You join when an influencer who has talked with you enters your email address, and
          you sign in with a one-time code sent to that address. There are no passwords.
        </p>
      </section>

      <section className="stack">
        <h2 className="h2">The email we send</h2>
        <p>
          InfluencerTrees sends two kinds of email, both from <code>{sender}</code>, and nothing else:
        </p>
        <ul>
          <li>A six-digit sign-in code, when you ask to sign in. It expires in ten minutes and works once.</li>
          <li>
            One invitation, when an influencer adds you, saying who convinced you and how to sign in. That influencer
            can resend it, at most once every ten minutes.
          </li>
        </ul>
        <p>Nothing is sent on a schedule. There is no newsletter and no marketing.</p>
        <p>
          If you did not expect an invitation, ignoring it is enough. To be sure you never hear from us again, reply
          to any email from us or write to <ContactAddress info={info} />, and we will block your address.
        </p>
      </section>

      <section className="stack">
        <h2 className="h2">What we keep, and who sees it</h2>
        <p>
          Your email address; the codename and avatar you confirm; if you gave them, your state, ZIP code,
          congressional district, phone number and your answers about voter registration; and who convinced whom.
          You choose who among the people in your idea’s tree can see your email address and phone number. The site
          itself always keeps your address, because it is how you sign in.
        </p>
        <p>
          We do not sell or share this information, show no advertising, and use no analytics or tracking. The only
          cookie is the one that keeps you signed in. Data is stored with Amazon Web Services in the United States. To
          have your account and everything it holds deleted, write to <ContactAddress info={info} />.
        </p>
      </section>

      <section className="stack">
        <h2 className="h2">Contact</h2>
        <p>
          Write to <ContactAddress info={info} />. Replies to any email from InfluencerTrees reach the same address, and
          a person reads it. See also <Link to="/contact">Contact us</Link>.
        </p>
      </section>
    </div>
  );
}
