# SES production access: what AWS asks, and the answer

Every new AWS account's SES is in the sandbox and only delivers to verified
addresses. Leaving it is a request AWS reviews by hand, in a support case.
The first request, for beta on 2026-09-19, came back within the hour asking
for more detail. This is the answer that was sent, kept here with the
addresses blanked so prod's request starts from it. Send the reply in the
existing case; a fresh request is a duplicate and gets closed.

## What the reviewers want to see

- How often you send, and how you chose the volume.
- How recipient lists are built and maintained.
- How bounces, complaints and unsubscribe requests are handled, as a
  process they can verify, not a metric.
- Examples of every message.
- A verified sending identity, and a website they can look at that says what
  the service is, what it sends, how to stop it and how to reach a person.

The things the product had to gain before the reply could be honest: a
reply-to address a person reads, public About and Contact pages, and
bounce and complaint notifications to an inbox.

## The reply

Replace `<site>`, `<domain>` and `<contact>`; delete the beta sentence for
prod.

---

Hello,

Thank you for the review. Here is how InfluencerTrees sends email.

**What the site is.** InfluencerTrees (`<site>`) is a membership site for
people who convince others of an idea in conversation. Joining is by
invitation only; there is no sign-up form. What the service is, the email it
sends, how to stop it and what it keeps are public at `<site>/about`, and a
contact address a person reads is at `<site>/contact`. *(Beta only: this is
the pre-production stage of https://influencertrees.com, which runs in a
separate AWS account and will request production access on its own.)*

**How often we send.** Only in response to two actions by a member, described
below. Expected volume is under 100 messages a day at this stage. We have not
asked for a quota above the default.

**How recipient lists are maintained.** There is no list. (1) A six-digit
sign-in code goes to a member's own address when they ask to sign in; there
are no passwords. (2) One invitation goes to a person whose address a
signed-in member types in after speaking with that person, who agreed to
join. No addresses are imported, purchased, scraped or collected from a
public form, and no address is emailed except by one of these two actions.

**Bounces and complaints.** The account-level suppression list is enabled
for both, so an address that bounces or complains is blocked from any further
sending automatically. Every bounce and complaint event is also published to
an SNS topic that emails the operator, and reputation metrics are enabled on
the configuration set all mail goes through and watched in CloudWatch.

**Unsubscribe requests.** Every message is transactional and nothing is sent
on a schedule, so there is nothing to subscribe to. Every message carries a
reply-to address that a person reads; anyone who replies, or writes to the
contact address on the site, has their address added to the suppression list
so nothing more is sent. An invitation can be resent by the inviting member
at most once every ten minutes, and a sign-in code at most three times per
address per fifteen minutes, enforced in the application and at the API
gateway.

**Verified identity.** The sending domain `<domain>` is a verified domain
identity in this account with DKIM (three CNAME records) and a DMARC record.
Mail is sent from `no-reply@<domain>` with the contact address as reply-to.

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
> What InfluencerTrees is and what email it sends: `<site>/about`
>
> If you would rather not hear from us, reply to this email or write to
> `<contact>`, and nothing more will be sent to you.

Thank you.

---
