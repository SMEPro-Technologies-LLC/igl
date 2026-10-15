# Email for id-me.ai

Mail for the id-me.ai domain is handled by Google Workspace. Cloudflare only holds the DNS records. Nothing in this repository sends mail; the platform API and the site write records, and people reply from mailboxes.

## Addresses and who reads them

| Address | Purpose | Type | Reaches |
|---|---|---|---|
| support@id-me.ai | Customer and developer support, the address on SUPPORT.md and in the console | Google Group (collaborative inbox) | Support rotation |
| sales@id-me.ai | Contact Sales form fallback, enterprise inquiries | Google Group | Sales |
| partners@id-me.ai | Resellers, integrators, platform partners | Google Group | Sales, leadership |
| security@id-me.ai | Vulnerability reports (SECURITY.md); treat as confidential | Google Group, restricted posting allowed from outside | Security lead, CTO |
| conduct@id-me.ai | Code of conduct reports | Google Group, restricted | Two named people, not the whole team |
| trademarks@id-me.ai | Trademark questions (TRADEMARK.md) | Alias of legal@ | Legal |
| press@id-me.ai | Media and analyst inquiries | Group | Marketing, leadership |
| legal@id-me.ai | Contracts, DPAs, terms | Group | Legal |
| noreply@id-me.ai | Sender for automated mail (future: receipts, approvals) | Alias on a service account, no inbox | Nobody; bounces are dropped |

Use Google Groups rather than user aliases for every address several people answer: a group has history, assignment and "mark as resolved", and survives staff changes. Groups cost nothing beyond the Workspace seats of the people in them.

## Setup, in order

1. **Create the Workspace** at workspace.google.com with id-me.ai as the primary domain, signed in as the Cloudflare account owner's identity (Admin@smepro.app) or another owner you control. Choose Business Starter or Standard; one seat per person who needs a mailbox. Groups do not need seats.
2. **Verify the domain.** Google gives a TXT record `google-site-verification=…`. Add it in Cloudflare under DNS, Records, as `TXT @` with the value Google shows. Proxy status does not apply to TXT.
3. **MX records.** Google now uses one record. In Cloudflare add `MX @ smtp.google.com` with priority 1, TTL Auto. Delete any other MX records for the apex (today there are none). Cloudflare's dashboard shows the "Email cannot reach @id-me.ai" warning until this exists.
4. **SPF.** `TXT @` with value `v=spf1 include:_spf.google.com ~all`. One SPF record only; if another service sends mail for the domain later, add its include to this same record rather than a second one.
5. **DKIM.** In the Google Admin console, Apps, Google Workspace, Gmail, Authenticate email, generate a 2048-bit key with selector `google`. Add the TXT record Google shows as `TXT google._domainkey` with the long `v=DKIM1; k=rsa; p=…` value, then click Start authentication. Cloudflare accepts the long value as one string.
6. **DMARC.** `TXT _dmarc` with value `v=DMARC1; p=quarantine; rua=mailto:dmarc@id-me.ai; adkim=s; aspf=s; pct=100`. Create dmarc@ as a group that only you read. Start with `p=quarantine`; move to `p=reject` after two weeks of clean reports. Cloudflare's DMARC Management (under Email) can read the reports for you.
7. **Groups.** In Google Admin, Groups, create each address in the table above as a collaborative inbox. For security@ and conduct@ set "Who can post" to anyone on the web so outsiders can report, and "Who can view conversations" to group members only. For the others, anyone can post, members only view.
8. **Signatures and auto-replies.** security@ should auto-acknowledge within the 48 hours SECURITY.md promises; set a Gmail vacation-style auto-reply on the group's collaborative inbox or a routing rule that sends a canned acknowledgment. Keep it short and without promises beyond the policy.
9. **Test.** Send from an outside address to each group; reply from the group and confirm the reply arrives with `id-me.ai` passing SPF, DKIM and DMARC (open the message's "Show original" in Gmail and look for `PASS` on all three).

## Records at a glance

| Type | Name | Content | Notes |
|---|---|---|---|
| TXT | @ | `google-site-verification=…` | from the Workspace setup screen |
| MX | @ | `smtp.google.com`, priority 1 | the only MX |
| TXT | @ | `v=spf1 include:_spf.google.com ~all` | one SPF record |
| TXT | google._domainkey | `v=DKIM1; k=rsa; p=…` | from Google Admin |
| TXT | _dmarc | `v=DMARC1; p=quarantine; rua=mailto:dmarc@id-me.ai; adkim=s; aspf=s; pct=100` | tighten to reject later |

## What the site and the repository already say

SUPPORT.md, SECURITY.md, CODE_OF_CONDUCT.md, TRADEMARK.md and the Contact Sales page name support@, security@, conduct@, trademarks@, partners@, press@ and sales@. Until the groups exist, mail to those addresses bounces, so do the setup above before the launch post goes out. The Contact Sales form itself does not depend on email: it writes to the `igl-intake` database and the operator console reads it; sales@ is the fallback shown only if that write fails.
