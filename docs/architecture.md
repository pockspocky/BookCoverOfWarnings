# Architecture

Book Of Warnings is a Nuxt 4 / Vue 3 client plus a separate Node API. Pages talk to one `ApiClient`. `createApiClient` always builds `HttpApiClient`, which calls `NUXT_PUBLIC_API_BASE_URL`.

SSR is off. The browser session is the API's httpOnly cookie. The page keeps only the CSRF token in memory. A server render would not see that cookie unless the API and the page share a request.

## Layout

| Path | Responsibility |
| --- | --- |
| `app/pages` | Routes. They call `$api` and do not import fixtures. |
| `app/components` | Tables, dialogs, graph, markdown, admin navigation. |
| `app/stores` | Pinia session, theme, toasts. |
| `app/middleware/auth.global.ts` | UX-only redirect to login or `/forbidden`. |
| `lib/types` | Entities, DTOs, and the `ApiClient` contract. |
| `lib/schemas` | Zod request checks shared by the API. |
| `lib/api` | HTTP adapter. |
| `server/` | Hono API, Drizzle schema, entity-module registry, auth, and privacy filters. |
| `docs/openapi.yaml` | HTTP contract implemented by `server/`. |

## Request path

1. The page calls a typed method such as `students.list` or `submissions.create`.
2. `HttpApiClient` sends the payload to the documented path with `credentials: 'include'`. Cookie mutations also send `X-CSRF-Token` from memory. The browser does not store a session token.
3. Login sets the httpOnly `bow_session` cookie. `GET /api/auth/session` returns `csrfToken` after a reload.
4. The API maps failures onto `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `CONSENT_REQUIRED`, `RATE_LIMITED`, or `NETWORK`.
5. Pages show skeletons, empty states, toasts, or the access-denied page. They do not catch an error and then render invented records.

## Extension

A new publishable type is a code module under `server/src/modules`. The module declares its Zod proposal, which operations each role may submit, the students who must consent, the sensitive keys to strip, and the `publish` / `correct` / `archive` steps that run in one database transaction. Search projection is whatever public columns that module marks as searchable.

`entity_type` is text in Postgres. Unknown types are rejected in validation. Trait categories, relationship types, and group roles stay administrator-managed vocabulary and do not require a new table.

Extra attributes use `field_definitions`. `published` and `admin_only` values go to `field_values`. `subject_private` values go only to `private_attribute_values`. Public reads, search, graph assembly, admin DTOs, audit rows, and logs do not join that table. `student_private_profiles` is a separate table and is only reachable from `GET/PATCH /api/me/private-profile`.

## Auth

Password hashes are argon2id. The email domain comes from `SCHOOL_EMAIL_DOMAIN`. A roster row can attach an unmatched pending account to a student id at login. Nothing matches on display name. Correcting a match deletes that account's sessions.

Cookie-only mutations require `X-CSRF-Token`. Bearer requests do not. Administrator role does not grant private-profile access.

Institutional login is an authorization-code redirect with PKCE. The callback accepts a verified school-domain email and links `oidc_issuer` plus `oidc_subject`. It does not read a display name. When the provider is unconfigured, the start and callback routes do not create a session. Secrets load from `NAME_FILE`, then `SECRETS_DIR/NAME`, then the environment. Production startup rejects placeholder passwords.

## Publishing

Members call `POST /api/submissions`. That call does not write a student, trait, group, membership, or relationship. Administrators approve or reject.

- Approve publishes inside one transaction and appends version history when the record is versioned. Private keys are removed before the revision is stored.
- A mirrored relationship is two submissions with the same `batch_id`. Approve publishes both or, if consent is missing, neither.
- Reject deletes the submission and consent rows that only pointed at it. The audit row stores the action, actor, time, and entity reference.
- Corrections carry `baseVersion`. A mismatch returns `409 CONFLICT` and leaves the published record unchanged.
- Personal relationships stay `awaiting_consent` until every subject grants consent. Approval does not satisfy a missing grant.
- Withdrawing consent archives the published entity on that grant and records a revision.

## Graph and search

`/graph` asks for `GET /api/graph` or `GET /api/graph/neighbors/{nodeType}/{nodeId}`. Overview starts from a small set of matching published students and groups and returns one hop, capped so it is not the whole database. Search reads `search_documents` after filtering on public tables. Neither payload includes private profile fields.

## What is intentionally absent

There is no export, no full-database graph, and no screen that shows private self-description to anyone except the matched student at `/me/private-profile`. The attachment scanner in this repository checks type and size. A malware scanner can replace that interface later. Do not load real student data before the institution's identity provider, publication policy, and operational review are in place.
