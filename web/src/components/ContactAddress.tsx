import type { SiteInfo } from '../lib/site';

/** The contact address as a mail link, or an honest placeholder. */
export function ContactAddress({ info }: { info: SiteInfo }) {
  if (info.loading) return <span className="muted">…</span>;
  if (!info.contactEmail) return <span className="muted">the contact address (not configured on this instance)</span>;
  return <a href={`mailto:${info.contactEmail}`}>{info.contactEmail}</a>;
}
