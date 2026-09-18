// Reference data shared by the API and the site.

export const ELECTION_YEAR = 2026;

/** USPS codes and names: the fifty states, DC, and the inhabited territories. */
export const STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
  { code: 'AS', name: 'American Samoa' }, { code: 'GU', name: 'Guam' }, { code: 'MP', name: 'Northern Mariana Islands' },
  { code: 'PR', name: 'Puerto Rico' }, { code: 'VI', name: 'U.S. Virgin Islands' },
];

export const STATE_CODES = STATES.map((s) => s.code) as [string, ...string[]];

/**
 * House seats per state after the 2020 apportionment. States with one seat
 * and the non-state jurisdictions (a delegate or resident commissioner) use
 * the at-large district "AL". The district string stored is "CA-12" or
 * "WY-AL"; it is self-reported, because a district cannot be derived from a
 * zip code without an exact address, which is deliberately not collected.
 */
export const HOUSE_SEATS: Readonly<Record<string, number>> = {
  AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, DC: 1, FL: 28, GA: 14, HI: 2, ID: 2,
  IL: 17, IN: 9, IA: 4, KS: 4, KY: 6, LA: 6, ME: 2, MD: 8, MA: 9, MI: 13, MN: 8, MS: 4, MO: 8,
  MT: 2, NE: 3, NV: 4, NH: 2, NJ: 12, NM: 3, NY: 26, NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17,
  RI: 2, SC: 7, SD: 1, TN: 9, TX: 38, UT: 4, VT: 1, VA: 11, WA: 10, WV: 2, WI: 8, WY: 1,
  AS: 1, GU: 1, MP: 1, PR: 1, VI: 1,
};

/** The district options for one state: ["CA-1", ..., "CA-52"] or ["WY-AL"]. */
export function districtsFor(state: string): string[] {
  const seats = HOUSE_SEATS[state];
  if (!seats) return [];
  if (seats === 1) return [`${state}-AL`];
  return Array.from({ length: seats }, (_, i) => `${state}-${i + 1}`);
}

export type EmailSharing = 'convincer' | 'hierarchy' | 'tree';
export type PhoneSharing = 'convincer' | 'nobody';
export type SystemEmails = 'none' | 'quarterly' | 'unrestricted';

export interface Prefs {
  emailSharing: EmailSharing;
  phoneSharing: PhoneSharing;
  systemEmails: SystemEmails;
}

export const DEFAULT_PREFS: Prefs = {
  emailSharing: 'convincer',
  phoneSharing: 'convincer',
  systemEmails: 'quarterly',
};

/**
 * The idea-level catalogue of display preferences (the spec's
 * IdeaDisplayPrefs: pref id to meaning). A subscription's chosen ids are
 * derived from its typed prefs with prefsToDisplayPrefIds.
 */
export const DISPLAY_PREFS: Readonly<Record<string, string>> = {
  'email:convincer': 'Share my email only with the person who convinced me',
  'email:hierarchy': 'Share my email with my whole convincer chain',
  'email:tree': "Share my email with everyone in this idea's tree",
  'phone:convincer': 'Share my phone only with the person who convinced me',
  'phone:nobody': 'Share my phone with nobody',
  'notify:none': 'No system emails about this idea',
  'notify:quarterly': 'A quarterly system email about this idea',
  'notify:unrestricted': 'System emails about this idea whenever there is news',
};

export function prefsToDisplayPrefIds(p: Prefs): string[] {
  return [`email:${p.emailSharing}`, `phone:${p.phoneSharing}`, `notify:${p.systemEmails}`];
}

export const EMAIL_SHARING_OPTIONS: ReadonlyArray<{ value: EmailSharing; label: string }> = [
  { value: 'convincer', label: 'Only the person who convinced me' },
  { value: 'hierarchy', label: 'My whole convincer chain' },
  { value: 'tree', label: "Everyone in this idea's tree" },
];

export const PHONE_SHARING_OPTIONS: ReadonlyArray<{ value: PhoneSharing; label: string }> = [
  { value: 'convincer', label: 'Only the person who convinced me' },
  { value: 'nobody', label: 'Nobody' },
];

export const SYSTEM_EMAIL_OPTIONS: ReadonlyArray<{ value: SystemEmails; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'unrestricted', label: 'Whenever there is news' },
];

/** Shown next to the email-sharing choice; the system itself always keeps the address. */
export const EMAIL_RETENTION_NOTE =
  'Like most systems, InfluencerTrees keeps your email address to send sign-in codes and to run the service. This setting only controls which other influencers can see it.';
