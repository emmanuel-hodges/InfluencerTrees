// Sharing preferences for one idea. Controls only; the page owns the <form>.
import {
  EMAIL_RETENTION_NOTE,
  EMAIL_SHARING_OPTIONS,
  PHONE_SHARING_OPTIONS,
  SYSTEM_EMAIL_OPTIONS,
  type Prefs,
} from '@inftrees/shared';
import type { FieldErrors } from '../lib/validation';
import { RadioGroup } from './Field';

interface Props {
  value: Prefs;
  onChange: (patch: Partial<Prefs>) => void;
  errors?: FieldErrors;
  disabled?: boolean;
}

export function PrefsForm({ value, onChange, errors = {}, disabled }: Props) {
  return (
    <fieldset className="stack" disabled={disabled}>
      <RadioGroup
        legend="Who can see my email"
        options={EMAIL_SHARING_OPTIONS}
        value={value.emailSharing}
        onChange={(emailSharing) => onChange({ emailSharing })}
        hint={EMAIL_RETENTION_NOTE}
        error={errors.emailSharing}
      />
      <RadioGroup
        legend="Who can see my phone number"
        options={PHONE_SHARING_OPTIONS}
        value={value.phoneSharing}
        onChange={(phoneSharing) => onChange({ phoneSharing })}
        error={errors.phoneSharing}
      />
      <RadioGroup
        legend="System emails about this idea"
        options={SYSTEM_EMAIL_OPTIONS}
        value={value.systemEmails}
        onChange={(systemEmails) => onChange({ systemEmails })}
        error={errors.systemEmails}
      />
    </fieldset>
  );
}
