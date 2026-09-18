// Who is signed in. Loaded once on mount from GET /api/me; a 401 means signed
// out. Pages call refresh() after anything that changes the profile so the
// header and guards see the new state.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MeResponse } from '@inftrees/shared';
import { api, ApiRequestError } from './api';

export interface Session {
  me: MeResponse | null;
  /** True until the first GET /api/me has answered. */
  loading: boolean;
  refresh: () => Promise<MeResponse | null>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<MeResponse | null> => {
    try {
      const next = await api.get<MeResponse>('/api/me');
      setMe(next);
      return next;
    } catch (e) {
      // 401 is the ordinary signed-out answer. Anything else (network, 5xx)
      // is also treated as signed out; the login page will surface it.
      if (!(e instanceof ApiRequestError && e.status === 401)) console.error('GET /api/me failed', e);
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post<{ ok: true }>('/api/auth/logout');
    } finally {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<Session>(() => ({ me, loading, refresh, logout }), [me, loading, refresh, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}

/** The signed-in user. Only valid under the RequireSession guard. */
export function useMe(): MeResponse {
  const { me } = useSession();
  if (!me) throw new Error('useMe called without a session');
  return me;
}
