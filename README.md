# Book Of Warnings

Authorized school directory and relationship database. Members browse approved, non-sensitive records. Changes go through administrator review. Private self-description is visible only to the matched student.

The Nuxt app is a client. `HttpApiClient` calls the API in `server/`. Route guards are interface behavior. The API checks every authorization, consent, and privacy rule again.

The API enforces those rules. It is not a finished student-records compliance system. Do not import real student data until attachment malware scanning and a publication policy are in place.

## Requirements

- Node.js 22+
- npm 10+
- Docker, for Postgres 16 and MinIO

## Install

```bash
npm ci
npm ci --prefix server
npm run secrets:init
docker compose up -d postgres minio
cp .env.example .env
```

Postgres is published on host port 5433.

## Configure

| Variable | Purpose |
| --- | --- |
| `NUXT_PUBLIC_API_BASE_URL` | API origin. Default `http://localhost:3001`. |
| `NUXT_PUBLIC_SCHOOL_EMAIL_DOMAIN` | Client-side email format check. Current value is `waprep.org`. The API enforces `SCHOOL_EMAIL_DOMAIN`. |
| `NUXT_PUBLIC_IDENTITY_MAPPING_SOURCE` | Operator note. The frontend does not connect to an identity provider. |

There are no demo accounts and no directory seed. `npm run admin:create` adds the first administrator from `ADMIN_EMAIL_FILE` and `ADMIN_PASSWORD_FILE`. School accounts use the issuer when `IDENTITY_PROVIDER=oidc`. Roster matching uses `roster_mappings` or an administrator correction.

## Develop

```bash
npm run dev
npm run dev --prefix server
```

Open `http://127.0.0.1:3000`. The API listens on port 3001 and migrates on startup. The `bow` database stays empty of people until you insert them.

## Test

```bash
npm test
npm run test:server
npm run typecheck
```

`npm test` runs Vitest for schemas, markdown sanitization, and HTTP client behavior. `npm run test:server` runs API integration tests against Postgres. Those tests insert the minimum rows inside a transaction and roll them back.

## Build

```bash
npm run build
npm run preview
```

`npm run build` outputs a Node server in `.output/`. See [docs/deployment.md](docs/deployment.md) for Compose and the API image.

## Product rules

- Ordinary members submit proposals. They do not publish directly.
- Personal relationship publication waits for subject consent. Administrator approval does not replace consent.
- Rejection deletes the proposal. There is no content-bearing rejection archive.
- A→B does not create B→A unless "Create mirrored relationship" is checked. The two records get different IDs and later edits stay independent. Both publish in one transaction or neither does.
- Private self-description is absent from directory pages, search, graph payloads, admin review, audit, and logs.
- Account-to-student matching is a roster import or an explicit correction, not a guess from similar names.
- Archiving a trait removes the trait-evidence link and keeps the evidence.

## Documentation

- [docs/architecture.md](docs/architecture.md)
- [docs/data-model.md](docs/data-model.md)
- [docs/security-and-privacy.md](docs/security-and-privacy.md)
- [docs/openapi.yaml](docs/openapi.yaml)
- [docs/deployment.md](docs/deployment.md)
- [TASKS.md](TASKS.md)

## Known limitations

- Institutional login stays off until the issuer and client secret are configured. It does not invent a successful school login.
- The attachment scanner rejects disallowed types and oversized files. It does not scan bytes for malware.
- Secrets come from files (`NAME_FILE` or `SECRETS_DIR`) before environment variables. Production rejects placeholder passwords.
- Graph overview loads a neighborhood around a few seeds, then expands on demand. It is not a full-database download.
- Frontend logs must not print private profiles, attachment bytes, or session tokens.
