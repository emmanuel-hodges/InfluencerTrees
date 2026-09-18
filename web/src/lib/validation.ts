// Turns zod issues into a flat { 'dotted.path': message } map for forms.

export type FieldErrors = Record<string, string>;

/** Key used for issues that have no path (whole-form problems). */
export const FORM_ERROR = '_form';

interface IssueLike {
  path: ReadonlyArray<PropertyKey>;
  message: string;
  code: string;
}

export function fieldErrorsFrom(error: { issues: ReadonlyArray<IssueLike> }): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || FORM_ERROR;
    if (out[key] !== undefined) continue; // first issue per field wins
    // An enum rejecting '' is always an unanswered radio group here; the
    // schema's own wording ("expected one of ...") is not what a person needs.
    out[key] = issue.code === 'invalid_value' ? 'Choose an answer' : issue.message;
  }
  return out;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
