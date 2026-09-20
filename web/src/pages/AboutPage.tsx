// Public. What the site is, what it keeps and who sees it: the page every
// invitation links to, and one a mail-provider reviewer reads. How to stop
// email is in the emails themselves and on the Contact page. Plain facts
// only; when the product changes, change this.
import { Link } from 'react-router';
import { ContactAddress } from '../components/ContactAddress';
import { usePageTitle } from '../lib/hooks';
import { useSiteInfo } from '../lib/site';

export function AboutPage() {
  usePageTitle('About');
  const info = useSiteInfo();

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
          to each other.
        </p>
        <p>
          You join when an influencer who has talked with you enters your email address, and you sign in with a
          one-time code sent to that address. There are no passwords.
        </p>
      </section>

      <section className="stack">
        <h2 className="h2">What we keep, and who sees it</h2>
        <p>
          Your email address; the codename and avatar you confirm; if you gave them: your state, ZIP code, phone
          number, and answers about the particular idea you chose to be a part of; and who convinced you to join.
          You choose who among the people in your idea’s tree can see your email address and only the person who
          convinced you of the idea can see your phone number if you agree and decide to share it. The site itself
          always keeps your email address, because it is how you sign in.
        </p>
        <p>
          InfluencerTrees does not sell or share this information. To have your account and everything it holds
          deleted, write to <ContactAddress info={info} />.
        </p>
      </section>

      <section className="stack">
        <h2 className="h2">Contact</h2>
        <p>
          Write to <ContactAddress info={info} />. See also <Link to="/contact">Contact us</Link>.
        </p>
      </section>
    </div>
  );
}
