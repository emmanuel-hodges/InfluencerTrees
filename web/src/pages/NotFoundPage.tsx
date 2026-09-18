import { Link } from 'react-router';
import { usePageTitle } from '../lib/hooks';

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <div className="page stack">
      <h1 className="h1">Page not found</h1>
      <p>
        There is nothing at this address. <Link to="/convince">Go to the home page</Link>.
      </p>
    </div>
  );
}
