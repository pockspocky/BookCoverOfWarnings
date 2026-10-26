# Book Of Warnings — Implementation Tasks

Status legend: `[ ]` pending · `[x]` complete · `[~]` partial  
The API in `server/` enforces auth, consent, and privacy. It is not a finished student-records compliance system.

## Blockers (real student data)

- Institutional login is implemented and stays inactive until `IDENTITY_PROVIDER=oidc` and the issuer credentials are set. An unconfigured provider does not create a session.
- The attachment scanner checks type and size only. It does not scan file bytes for malware.
- Secrets load from `NAME_FILE` or `SECRETS_DIR` before environment variables. Production rejects placeholder passwords. The school still has to point those files at its secret store.
- A school publication and privacy policy must be adopted before any real-student import.
- The database starts empty. There is no roster seed.

---

## Phase 1 — Project Foundation

Dependencies: none

- [x] Initialize Nuxt 4 + TypeScript strict mode
- [x] Configure Tailwind, dark-first theme, light-mode toggle tokens
- [x] Establish project structure (components, composables, pages, stores, services, models, fixtures, tests, docs)
- [x] Configure linting, Vitest, and environment variables (`NUXT_PUBLIC_API_BASE_URL`)

**Definition of done:** App bootstraps, typechecks, and applies the design tokens.

---

## Phase 2 — Domain Models

Dependencies: Phase 1

- [x] Entities and public/private DTOs (UUID PKs, ISO timestamps)
- [x] Zod validation schemas
- [x] Relationship constraints (polymorphic endpoints, directional, non-unique pairs)
- [x] Versioning, consent, submission, and profile-matching structures

**Definition of done:** Shared types compile and schemas reject invalid payloads in tests.

---

## Phase 3 — API Infrastructure

Dependencies: Phase 2

- [x] Typed service interfaces
- [x] `HttpApiClient` against the Hono API in `server/`
- [x] Standardized API error types
- [x] OpenAPI 3.1 contract (`docs/openapi.yaml`)

**Definition of done:** Pages depend only on `ApiClient` / `HttpApiClient`.

---

## Phase 4 — Authentication and Permissions

Dependencies: Phase 3

- [x] Login UI (school-email validation, session token stored for the bearer header)
- [x] Account/session Pinia state
- [x] Route guards (UX only; documented as non-authoritative)
- [x] Role-based visibility
- [x] Profile matching from roster mappings or an administrator correction that revokes sessions

**Definition of done:** Unauthorized routes show access-denied. Accounts are created in the database, not shipped as a seed.

---

## Phase 5 — Core Pages

Dependencies: Phase 4

- [x] Students directory + profile
- [x] Traits directory + profile
- [x] Evidence directory + profile
- [x] Groups directory + profile
- [x] Relationships directory, detail, and create (mirror checkbox)

**Definition of done:** Browse and detail routes render the public API projections and cross-links.

---

## Phase 6 — Search and Graph

Dependencies: Phase 5

- [x] Global search
- [x] Advanced filters
- [x] Cross-reference queries
- [x] Interactive Vue Flow graph (pan/zoom/fit, filters, neighbors)
- [x] Contextual navigation from nodes/edges

**Definition of done:** Search respects visibility; graph payload excludes private fields.

---

## Phase 7 — Submissions and Administration

Dependencies: Phase 5

- [x] Submission forms and member submission list
- [x] Admin approval queue (approve / reject-with-deletion)
- [x] Admin management pages (students, groups, traits, evidence, relationships, categories)
- [x] Consent workflow
- [x] Evidence verification + reliability
- [x] Relationship mirroring (one transaction, two ids)
- [x] Profile matching corrections with session refresh

**Definition of done:** Members cannot publish directly. Approve, reject, and consent run in the database.

---

## Phase 8 — History and Privacy

Dependencies: Phase 7

- [x] Version history views
- [x] Relationship and membership timelines
- [x] Private self-description (`/me/private-profile`)
- [x] Archival behavior
- [x] Consent withdrawal
- [x] Field-level access validation in the API and integration tests

**Definition of done:** Private sexuality never appears in public DTOs, search, graph, or admin review screens.

---

## Phase 9 — Testing

Dependencies: Phases 2–8

- [x] Unit tests (schemas, HTTP client, markdown)
- [x] Server integration tests (consent, privacy, mirroring, conflicts, session revocation) with transactional rollback
- [x] Role-access, privacy, graph, and API failure-state tests

**Definition of done:** Automated tests cover the behaviors listed in the specification.

---

## Phase 10 — Documentation and Delivery

Dependencies: Phases 1–9

- [x] README (install, dev, build, test, config, deploy)
- [x] API / architecture / data-model / security docs
- [x] `.env.example`
- [x] Deployment instructions (static/Node) and known limitations
- [x] Final acceptance checklist (this file)

**Definition of done:** A new engineer can run the empty database, the API, and the client.

---

## Incomplete / out of scope (recorded, not silently omitted)

The API enforces permissions and consent. It is not a completed compliance system.

| Item | Status |
| --- | --- |
| Institutional login | Interface only. Unconfigured login does not report success. |
| Attachment malware scanning | Type and size checks plus MinIO. No byte scanner. |
| Production key management | Environment variables. |
| Authoritative roster feed | `roster_mappings` import or admin correction. No name-similarity matching. |
| School publication and privacy policy | Not adopted by this repository. |
| Nuxt route guards | UX only. Documented in `docs/security-and-privacy.md`. |
