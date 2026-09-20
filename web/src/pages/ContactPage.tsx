// Public. One address, and what it is for.
import { Link } from 'react-router';
import { ContactAddress } from '../components/ContactAddress';
import { usePageTitle } from '../lib/hooks';
import { useSiteInfo } from '../lib/site';

export function ContactPage() {
  usePageTitle('Contact us');
  const info = useSiteInfo();

  return (
    <div className="page stack prose">
      <header className="page-header">
        <h1 className="h1">Contact us</h1>
      </header>
      <p>
        Write to <ContactAddress info={info} /> about anything to do with InfluencerTrees: a question, an invitation
        you did not expect, to have your address blocked so nothing more is sent, or to have your account and its data
        deleted.
      </p>
      <p>
        <Link to="/about">About InfluencerTrees</Link>
      </p>
    </div>
  );
}
