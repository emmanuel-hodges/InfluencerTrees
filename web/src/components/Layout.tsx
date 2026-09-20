import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router';
import { useSession } from '../session';
import { Avatar } from './Avatar';

export function Layout() {
  const { me, logout } = useSession();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const commit = import.meta.env.VITE_COMMIT ?? 'dev';

  async function onSignOut() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className="app">
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/convince" className="brand">
            InfluencerTrees
          </Link>
          {me ? (
            <div className="site-header__user">
              <Avatar avatarId={me.profile.avatarId} size={28} />
              <span className="site-header__codename">{me.profile.codename}</span>
              <button type="button" className="btn btn--ghost btn--small" onClick={onSignOut} disabled={signingOut}>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="container site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container site-footer__inner">
          <nav className="site-footer__links" aria-label="About this site">
            <Link to="/about">About</Link>
            <Link to="/contact">Contact us</Link>
          </nav>
          <span>
            build <code>{commit}</code>
          </span>
        </div>
      </footer>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="loading" role="status" aria-live="polite">
      <p className="muted">Loading…</p>
    </div>
  );
}
