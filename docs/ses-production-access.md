# SES production access: what AWS asks, and the answer

Every new AWS account's SES is in the sandbox and only delivers to verified
addresses. Leaving it is a request AWS reviews by hand, in a support case.
The first request, for beta on 2026-09-19, came back within the hour asking
for more detail. This is the answer, kept here with placeholders so prod's
request starts from it. `<contact>` is the support inbox,
`influencertrees-support@pm.me`, set as `contact_email` in each root and the
reply-to of every message. Send the reply in the existing case; a fresh
request is a duplicate and gets closed.

## What the reviewers want to see

- How often you send, and how you chose the volume.
- How recipient lists are built and maintained.
- How bounces, complaints and unsubscribe requests are handled, as a
  process they can verify, not a metric.
- Examples of every message.
- A verified sending identity, and a website they can look at that says what
  the service is and what it keeps, and how to reach a person.

The things the product had to gain before the reply could be honest: a
reply-to address a person reads, public About and Contact pages, and
bounce and complaint notifications to an inbox.

## Keep this true

Claims in the reply that can go stale, and what to do when they do:

- **"Nothing is sent on a schedule."** True today. System emails are a
  member preference already (none, quarterly, whenever there is news) but
  none exist. The About page stopped promising it on 2026-09-20; when the
  first system email ships, the reply for prod must describe it and the
  preference that turns it off.
- **The notification topic.** Needs `sns:*` on the deploy role and
  `bounce_notification_email` in the root. Beta has both since 2026-09-20,
  and the support inbox confirmed its subscription the same day, so the
  sentence in the reply is true for beta. Prod: bootstrap first, then the
  confirmation click, before claiming it.
- **Blocking on request.** Manual today: replies and requests reach the
  support inbox, and the founder runs `aws sesv2 put-suppressed-destination`.
  A stop address on our own domain, received by SES and handled by the API,
  is the planned automatic path; when it exists, say so and name it.
- **Ads.** The site will be ad supported. Ads send no email, so the reply
  need not mention them, but the About page no longer says "no advertising"
  and must not be quoted as if it did.
- **The reply-to.** It is the support inbox, never the founder's address;
  the first draft said otherwise and was corrected before sending. The About
  page no longer describes the email or how to stop it; the emails themselves
  and the Contact page do, so the reply points at `/about` for what is kept
  and how to get it deleted, and at `/contact` for a person.

## The reply

Replace `<site>`, `<domain>` and `<contact>`; delete the beta sentence for
prod. This is what the founder sent in beta's case on 2026-09-20, after
three fixes to the draft: the consent sentence had said the opposite of what
it meant, the reply-to had named the founder, and the invitation sample had
to match what the code sends.

---

Hello,

Thank you for the review. Here is how InfluencerTrees sends email.

**What the site is.** InfluencerTrees (`<site>`) is a membership site for
people who convince others of an idea in conversation. Joining is by
invitation only; there is no sign-up form. What the service is, the
information it retains, and how to get it deleted are at `<site>/about`,
and a contact address a person reads is at `<site>/contact`. *(Beta only:
This is the pre-production stage of https://influencertrees.com, which runs
in a separate AWS account and will request production access on its own.)*

**How often we send.** Currently, only in response to two actions by a
member, described in the paragraph below. Expected volume is under 100
messages a day at this stage. We have not asked for a quota above the
default.

**How recipient lists are maintained.** The email "list" is only grown from
a user convincing others to become a part of growing an idea. (1) A
six-digit sign-in code goes to a member's own address when they ask to sign
in; there are no passwords. (2) One invitation goes to a person whose
address a signed-in member types in after speaking with that person, who
agreed to join. No addresses are imported, purchased, scraped or collected
from a public form, and today no address is emailed except by one of these
two actions. Any email that gets sent out would be as a result of the consent
of the member and the member can have their account deleted at any time
(`<site>/about`).

**Bounces and complaints.** The account-level suppression list is enabled
for both, so an address that bounces or complains is blocked from any further
sending automatically. Every bounce and complaint event is also published to
an SNS topic that emails the operator. Reputation
metrics are enabled on the configuration set all mail goes through and are
watched in CloudWatch.

**Unsubscribe requests.** Today, every message is transactional and nothing
is sent on a schedule, so there is nothing to subscribe to. Every message
carries a reply-to address that a person reads; anyone who replies, or
writes to the contact address on the site, has their address added to the
suppression list so nothing more is sent. An invitation can be resent by the
inviting member at most once every ten minutes, and a sign-in code at most
three times per address per fifteen minutes, enforced in the application and
at the API gateway.

**Verified identity.** The sending domain `<domain>` is a verified domain
identity in this account with DKIM (three CNAME records) and a DMARC record.
Mail is sent from `no-reply@<domain>` with `<contact>` as reply-to.

**Examples.** Plain-text bodies; each is also sent as HTML with the same
words.

Sign-in code. Subject: Your InfluencerTrees sign-in code

> Your InfluencerTrees sign-in code is 482913.
>
> It expires in 10 minutes and works once.
>
> If you did not ask for a code, you can ignore this email.

Invitation. Subject: Humble Rabbit invited you to help advance Elect
Democratic US House and Senate Legislators

> Humble Rabbit convinced you to become an influencer for the idea "Elect
> Democratic US House and Senate Legislators" on InfluencerTrees.
>
> Sign in at `<site>/login` using this exact email address: recipient@example.com
>
> There is no password. Each time you sign in, a one-time code is emailed to you.
>
> What InfluencerTrees is, what it collects, and who sees it: `<site>/about`
>
> If you would rather not hear from us, reply to this email or write to
> `<contact>`, and nothing more will be sent to you.

Thank you.

---
