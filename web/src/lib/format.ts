import { STATES } from '@inftrees/shared';

const stateNames = new Map(STATES.map((s) => [s.code, s.name]));

export function stateName(code: string | null | undefined): string | null {
  if (!code) return null;
  return stateNames.get(code) ?? code;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
}

/** Renders a stored E.164 US number as (555) 123-4567; anything else as is. */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone;
}

/** "CA-12" -> "District 12", "WY-AL" -> "At large (WY-AL)". */
export function districtLabel(district: string): string {
  const seat = district.slice(district.indexOf('-') + 1);
  return seat === 'AL' ? `At large (${district})` : `District ${seat}`;
}
