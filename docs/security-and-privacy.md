# Security and privacy

Book Of Warnings is a private directory for authorized school accounts. It is not a harassment, rumor, or unconsented sensitive-information product.

The API enforces the controls in this file. That enforcement is not a certification that a deployment meets a school's records policy. Do not import real student data until a malware scanner inspects attachment bytes and the school has adopted a publication policy.

## What the API enforces, and what is still missing

| Control | This repository | Still required before real student data |
| --- | --- | --- |
| Login | argon2id for local accounts. Institutional login uses authorization code, PKCE, and a verified school email. Empty email and password open a shared anonymous member session with regular member access and no administrator access. The httpOnly cookie is the browser session. | The school's issuer, client id, and client secret. Unconfigured OIDC does not create a session. |
| Authorization | Every route rechecks identity, role, and object access. Route middleware is UX only. | Operational review of the role model. |
| CSRF | Cookie-only mutations require `X-CSRF-Token`. Bearer requests do not. | `Secure` cookies on HTTPS (`COOKIE_SECURE=true`). |
| Rate limits | Database sliding window. Defaults are 30 submissions per hour and 60 searches per minute. Over the limit returns `429` and `Retry-After`. | Thresholds chosen for the school. |
| Attachments | Type and size check, short-lived upload ticket, bytes in MinIO, second check before download. | A malware scanner that replaces the local type/size scanner. |
| Identity match | `roster_mappings` by email, or an administrator correction that deletes the account's sessions. | An authoritative roster feed. Never match on display name. |
| Audit | Operation, actor, time, and entity reference. Private keys are stripped before revisions. | Tamper-evident retention chosen by the school. |
| Secrets | `NAME_FILE`, then `SECRETS_DIR/NAME`, then the environment. Production rejects placeholder passwords. | The platform's secret store feeding those files. |
| Policy | Rules in this file and the API | Adopted publication and privacy policy, plus a process for removal. |

## Publication

Approved, non-sensitive factual information can be published after administrator approval. Personal claims, including personal relationships, need valid subject consent first. Approval does not create consent. Administrator role does not grant a subject's consent.

Ordinary users submit. They cannot call a publish method. Pending and rejected content is excluded from search, the dashboard, and the graph. Rejection deletes the proposal body and consent rows that only pointed at that proposal.

Corrections do not change the published row until approval. A stale `baseVersion` returns `409 CONFLICT` and leaves the published row unchanged.

A student seeking removal of non-consensual personal information is not blocked by someone else's correction workflow. Consent withdrawal archives the granted entity and records a version. A separate archive or correction submission remains available.

## Private self-description

`StudentPrivateProfile` is editable at `/me/private-profile` by the matched student only.

It must not appear in:

- other members' screens
- administrator review, queues, or record editors
- search documents and filters
- graph nodes, edges, and tooltips
- audit rows and logs
- exports (none are implemented)

The API keeps the profile on its own endpoint. Submission payloads drop keys that match `sexual` before they are stored. `subject_private` field values go to `private_attribute_values`, which public queries, search, graph assembly, admin DTOs, audit, and logs do not join. The field catalog cannot promote private-profile columns onto a public entity. Integration tests cover subject access, refusal for other members and administrators, search, graph, and the review queue.

The directory does not infer this field from evidence, relationships, groups, or names.

## Evidence

URLs must be HTTPS. Provider identity is an admin moderation fact. Other members receive a redacted provider id and the label "Provider identity withheld". Attachments are untrusted. Retrieval checks an authorization flag and fails closed. Upload authorization returns a ticket. Bytes go to object storage and are not indexed.

## Sessions and errors

Login sets an httpOnly `SameSite=Lax` cookie named `bow_session` and does not put the token in JSON or in a script-readable cookie. The page keeps `csrfToken` in memory and sends it as `X-CSRF-Token` on cookie mutations. The browser must not log tokens, private profiles, or attachment contents.

`ApiError` carries a code and field errors for forms. It is the only failure channel. Components do not substitute invented rows after an error.

## Frontend guards

`/admin` redirects non-administrators to `/forbidden`. Unauthenticated routes redirect to `/login`. An expired session cookie shows a session-expired notice. These redirects are convenience. Hiding a button is not a security boundary.

## Data in this repository

Migrations create empty tables. Tests insert disposable rows and roll them back. The configured school domain is `waprep.org`. Changing `NUXT_PUBLIC_SCHOOL_EMAIL_DOMAIN` only changes the client-side format check. The API uses `SCHOOL_EMAIL_DOMAIN`.
