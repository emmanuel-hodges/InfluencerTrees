// Routes and the two guards that keep them honest:
//  - RequireSession: everything but /login, /about and /contact needs a
//    signed-in user, and a user who has not finished onboarding is held on
//    /welcome until they have.
//  - PublicOnly: a signed-in user who lands on /login is sent home.
import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { Layout, LoadingScreen } from './components/Layout';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { ConvincePage } from './pages/ConvincePage';
import { IntakePage } from './pages/IntakePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { WelcomePage } from './pages/WelcomePage';
import { SessionProvider, useSession } from './session';

function RequireSession() {
  const { me, loading } = useSession();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!me) return <Navigate to="/login" replace />;
  const onboarded = me.profile.onboardingComplete;
  const onWelcome = location.pathname === '/welcome';
  if (!onboarded && !onWelcome) return <Navigate to="/welcome" replace />;
  if (onboarded && onWelcome) return <Navigate to="/convince" replace />;
  return <Outlet />;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  if (loading) return <LoadingScreen />;
  if (me) return <Navigate to={me.profile.onboardingComplete ? '/convince' : '/welcome'} replace />;
  return children;
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <PublicOnly>
        <LoginPage />
      </PublicOnly>
    ),
  },
  // Public, signed in or not: what the site is and how to reach a person.
  {
    element: <Layout />,
    children: [
      { path: '/about', element: <AboutPage /> },
      { path: '/contact', element: <ContactPage /> },
    ],
  },
  {
    element: <RequireSession />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <Navigate to="/convince" replace /> },
          { path: '/convince', element: <ConvincePage /> },
          { path: '/intake', element: <IntakePage /> },
          { path: '/welcome', element: <WelcomePage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  );
}
