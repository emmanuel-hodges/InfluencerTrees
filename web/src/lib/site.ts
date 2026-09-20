// Public facts the site shows before anyone signs in, from GET /api/site.
import { useEffect, useState } from 'react';
import type { SiteInfoResponse } from '@inftrees/shared';
import { api } from '../api';

export interface SiteInfo {
  contactEmail: string | null;
  loading: boolean;
}

export function useSiteInfo(): SiteInfo {
  const [info, setInfo] = useState<SiteInfo>({ contactEmail: null, loading: true });
  useEffect(() => {
    let ignore = false;
    api
      .get<SiteInfoResponse>('/api/site')
      .then((r) => {
        if (!ignore) setInfo({ contactEmail: r.contactEmail, loading: false });
      })
      .catch(() => {
        if (!ignore) setInfo({ contactEmail: null, loading: false });
      });
    return () => {
      ignore = true;
    };
  }, []);
  return info;
}
