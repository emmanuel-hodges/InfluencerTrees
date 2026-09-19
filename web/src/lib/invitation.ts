// Copy for an invitation that did not go out. The API says why when the
// transport said so. The sandbox case lasts until the address is verified,
// so it must not read like a hiccup worth retrying.
import type { EmailFailure } from '@inftrees/shared';

export function invitationFailureText(failure: EmailFailure | null, email: string | null): string {
  if (failure === 'unverified_recipient') {
    return `The mail service refused ${email ?? 'that address'}: this site can only email addresses that have been verified with it. Once it is verified, use Resend invitation.`;
  }
  return 'The invitation email failed to send. Try Resend invitation in a moment.';
}
