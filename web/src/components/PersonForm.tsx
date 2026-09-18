// The fields shared by intake, welcome and profile: where a person votes and
// how. Renders controls only; the page around it owns the <form>, so one
// submit can carry these fields together with an email, identity or prefs.
import { useId, useMemo } from 'react';
import { districtsFor, ELECTION_YEAR, STATES, type Profile, type Voting } from '@inftrees/shared';
import { districtLabel } from '../lib/format';
import type { FieldErrors } from '../lib/validation';
import { describedBy, Field, RadioGroup } from './Field';

export interface PersonValues {
  /** USPS code, or '' for "Unknown" (stored as null). */
  state: string;
  zip: string;
  /** "CA-12", or '' for "Not sure" (stored as null). */
  district: string;
  phone: string;
  registered: Voting['registered'] | '';
  method: Voting['method'] | '';
  hasMailBallot: 'yes' | 'no' | '';
}

export const EMPTY_PERSON: PersonValues = {
  state: '',
  zip: '',
  district: '',
  phone: '',
  registered: '',
  method: '',
  hasMailBallot: '',
};

export function personValuesFromProfile(p: Profile): PersonValues {
  return {
    state: p.state ?? '',
    zip: p.zip ?? '',
    district: p.district ?? '',
    phone: p.phone ?? '',
    registered: p.voting.registered,
    method: p.voting.method,
    hasMailBallot: p.voting.hasMailBallot ?? '',
  };
}

/** The raw input the shared zod schemas validate; '' becomes null where the schema wants it. */
export function personBodyFrom(v: PersonValues) {
  return {
    state: v.state === '' ? null : v.state,
    zip: v.zip.trim() === '' ? null : v.zip,
    district: v.district === '' ? null : v.district,
    phone: v.phone,
    voting: {
      registered: v.registered,
      method: v.method,
      hasMailBallot: v.method === 'mail' && v.hasMailBallot !== '' ? v.hasMailBallot : null,
    },
  };
}

const REGISTERED_OPTIONS: ReadonlyArray<{ value: Voting['registered']; label: string }> = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'not_sure', label: 'Not sure' },
];

const METHOD_OPTIONS: ReadonlyArray<{ value: Voting['method']; label: string }> = [
  { value: 'election_day', label: 'In person on election day' },
  { value: 'early', label: 'Early in person' },
  { value: 'mail', label: 'By mail' },
  { value: 'not_sure', label: 'Not sure' },
];

const BALLOT_OPTIONS: ReadonlyArray<{ value: 'yes' | 'no'; label: string }> = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

interface Props {
  value: PersonValues;
  onChange: (patch: Partial<PersonValues>) => void;
  errors?: FieldErrors;
  disabled?: boolean;
}

export function PersonForm({ value, onChange, errors = {}, disabled }: Props) {
  const id = useId();
  const stateId = `${id}-state`;
  const zipId = `${id}-zip`;
  const districtId = `${id}-district`;
  const phoneId = `${id}-phone`;
  const districts = useMemo(() => districtsFor(value.state), [value.state]);

  const zipHint = 'Five digits. Leave blank if unknown.';
  const districtHint = value.state
    ? 'Self-reported. A zip code alone cannot tell us the district.'
    : 'Choose a state first.';
  const phoneHint = 'Optional. A 10-digit US number.';

  return (
    <fieldset className="stack" disabled={disabled}>
      <Field id={stateId} label="State" error={errors.state}>
        <select
          id={stateId}
          className="input"
          value={value.state}
          onChange={(e) => onChange({ state: e.target.value, district: '' })}
          aria-describedby={describedBy(stateId, { error: errors.state })}
        >
          <option value="">Unknown</option>
          {STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <Field id={zipId} label="Zip code" hint={zipHint} error={errors.zip}>
        <input
          id={zipId}
          className="input input--short"
          value={value.zip}
          onChange={(e) => onChange({ zip: e.target.value.replace(/\D/g, '').slice(0, 5) })}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          aria-describedby={describedBy(zipId, { hint: zipHint, error: errors.zip })}
        />
      </Field>

      <Field id={districtId} label="Congressional district" hint={districtHint} error={errors.district}>
        <select
          id={districtId}
          className="input"
          value={value.district}
          onChange={(e) => onChange({ district: e.target.value })}
          disabled={!value.state}
          aria-describedby={describedBy(districtId, { hint: districtHint, error: errors.district })}
        >
          <option value="">Not sure</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {districtLabel(d)}
            </option>
          ))}
        </select>
      </Field>

      <Field id={phoneId} label="Phone" hint={phoneHint} error={errors.phone}>
        <input
          id={phoneId}
          className="input"
          type="tel"
          value={value.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          autoComplete="tel"
          aria-describedby={describedBy(phoneId, { hint: phoneHint, error: errors.phone })}
        />
      </Field>

      <RadioGroup
        legend={`Are you positive that you are registered to vote in ${ELECTION_YEAR}?`}
        options={REGISTERED_OPTIONS}
        value={value.registered}
        onChange={(registered) => onChange({ registered })}
        error={errors['voting.registered']}
      />

      <RadioGroup
        legend={`How are you going to vote in ${ELECTION_YEAR}?`}
        options={METHOD_OPTIONS}
        value={value.method}
        onChange={(method) => onChange({ method, hasMailBallot: method === 'mail' ? value.hasMailBallot : '' })}
        error={errors['voting.method']}
      />

      {value.method === 'mail' ? (
        <RadioGroup
          legend="Do you already have your mail-in ballot?"
          options={BALLOT_OPTIONS}
          value={value.hasMailBallot}
          onChange={(hasMailBallot) => onChange({ hasMailBallot })}
          error={errors['voting.hasMailBallot']}
        />
      ) : null}
    </fieldset>
  );
}
