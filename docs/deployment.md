# Deployment

The local stack is a Nuxt client, a Node API, Postgres 16, and MinIO. Migrations create empty tables. There is no directory seed and no demo account switch. Vercel is a separate path: one Nuxt project, Neon Postgres, and no MinIO.

## Local stack

Postgres is published on host port **5433** so it does not collide with another local Postgres already bound to 5432.

```bash
docker compose up -d postgres minio
npm run secrets:init
cp .env.example .env
npm ci
npm ci --prefix server
npm run dev
npm run dev --prefix server
```

`npm run secrets:init` writes `secrets/` and points `server/.env` at those values. The files are gitignored. Compose reads `secrets/postgres_password`, `secrets/minio_root_password`, `secrets/database_url`, and `secrets/s3_secret_key`. An existing Postgres volume keeps its original password until you alter the role or recreate the volume.

The API listens on `http://localhost:3001` and runs migrations on startup. `GET /health` checks the database. The site listens on `http://localhost:3000` and calls `NUXT_PUBLIC_API_BASE_URL`.

`bow` stays empty until an operator inserts roster rows and vocabulary. Integration tests use `bow_test`, insert the rows they need inside a transaction, and roll them back.

Create the first administrator without putting the password in the shell history:

```bash
printf '%s' 'admin@waprep.org' > secrets/admin_email
printf '%s' 'a-long-random-password' > secrets/admin_password
ADMIN_EMAIL_FILE=secrets/admin_email ADMIN_PASSWORD_FILE=secrets/admin_password npm run admin:create
```

The command refuses to run when an administrator already exists. The password must be at least 12 characters and the email must use `SCHOOL_EMAIL_DOMAIN`. Institutional users sign in through the issuer when `IDENTITY_PROVIDER=oidc` and `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` are set. Do not import real students until attachment malware scanning and a publication policy are in place.

## Containers

```bash
docker compose up --build
```

That starts Postgres, MinIO, and the API. Build the Nuxt image separately when you want the client in a container:

```bash
docker build -t book-of-warnings .
docker run --rm -p 3000:3000 \
  -e NUXT_PUBLIC_API_BASE_URL=http://localhost:3001 \
  -e NUXT_PUBLIC_SCHOOL_EMAIL_DOMAIN=waprep.org \
  book-of-warnings
```

`NUXT_PUBLIC_*` values are compiled into the client bundle. Do not place secrets in them. The API reads secret files before `server/.env`. Set `COOKIE_SECURE=true` and `NODE_ENV=production` behind HTTPS. Production startup rejects placeholder database and object-storage passwords.

For cookie sessions, the browser origin in `WEB_ORIGIN` must be allowed to send credentialed requests. Bearer tokens returned at login do not need CSRF. Cookie-only mutations do.

## Vercel

One Vercel project serves the Nuxt client and the API on the same host. The browser calls `/api` there, so the `bow_session` cookie stays on that site. Do not deploy the `server/` package as its own project. `*.vercel.app` is a public suffix, and a second project would drop the cookie.

Import the repository with the Nuxt framework and the repository root as the root directory. Use Node.js 22. Vercel runs `nuxt build`. Nitro's server directory is `app/server`, so it does not scan the Hono package in `server/`. The catch-all route forwards `/api/*` to `createApp`. Each instance initializes that app once, runs the SQL in `server/drizzle` under `pg_advisory_xact_lock`, and does not call `serve()`. `npm run dev --prefix server` and `docker compose` still start the long-running API.

### Neon

Add Neon Postgres and set `DATABASE_URL` to the pooled connection string. The hostname contains `-pooler`. A direct Neon URL lets serverless instances exhaust the connection limit. On Vercel the pool size is 1, prepared statements are off (Neon's pooler is PgBouncer in transaction mode), and idle connections close after 20 seconds.

Cold starts apply migrations inside one transaction while holding the advisory lock, so two instances cannot change the schema at the same time. The lock is transaction-scoped so it still works through the pooler. Migrations create empty tables. Do not copy the local `bow` database, its administrator, or rows created by browser tests.

Production startup rejects placeholder passwords such as `bow`.

### Variables

Set Production and Preview separately. A preview deployment must not point at the production database.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled URL (`-pooler`) |
| `SCHOOL_EMAIL_DOMAIN` | `waprep.org` |
| `NUXT_PUBLIC_SCHOOL_EMAIL_DOMAIN` | `waprep.org` |
| `NUXT_PUBLIC_API_BASE_URL` | Empty or unset, so the browser calls same-origin `/api`. This value is compiled into the client at build time. |
| `NODE_ENV` | `production` |

Leave `WEB_ORIGIN` and `API_PUBLIC_URL` unset unless you need a fixed canonical origin. Both then become `https://$VERCEL_URL`. `COOKIE_SECURE` defaults to on when `VERCEL` is set. Set `COOKIE_SECURE=false` only when you intentionally need an insecure cookie.

Do not set `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, or `IDENTITY_PROVIDER`. Attachments stay unavailable, and institutional login stays off. There is no MinIO on Vercel. Secrets are environment variables. Vercel has no `secrets/` directory.

`NUXT_PUBLIC_*` values are public. Do not put the database URL or a password in them.

### First administrator

Create the first account from your computer against Neon, not against the Docker database on port 5433. The command refuses to run when an administrator already exists. It does not import local `bow` data.

```bash
printf '%s' 'admin@waprep.org' > secrets/admin_email
printf '%s' 'a-long-random-password' > secrets/admin_password
DATABASE_URL='postgresql://...-pooler...' \
SCHOOL_EMAIL_DOMAIN=waprep.org \
ADMIN_EMAIL_FILE=secrets/admin_email \
ADMIN_PASSWORD_FILE=secrets/admin_password \
npm run admin:create
```

A `DATABASE_URL` in the shell overrides `server/.env`. Do not print the Neon URL or the password. Open the deployment's HTTPS address and sign in with that administrator.

A custom domain can be added later. The same-origin `/api` design does not depend on it. Institutional login stays disabled until an issuer, client id, and client secret exist.

## Health of a release

```bash
npm test
npm run test:server
npm run typecheck
npm run build
```

`npm test` covers the HTTP client and shared schemas. `npm run test:server` needs Postgres from Compose and covers consent, privacy, mirroring, conflicts, and session revocation. These checks do not replace a penetration test or a school privacy review.

## Not done

- Attachment scanning rejects illegal types and oversized files. It does not inspect file bytes for malware.
- The running API enforces the permissions and consent rules in this repository. That is not a certification that the deployment meets a school's records policy.
