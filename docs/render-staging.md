# Deploy develop as a Render staging site

No VPS or purchased domain is required. Render supplies HTTPS onrender.com URLs.
Keep the existing React, FastAPI and PostgreSQL architecture; this is not a Workers/D1 rewrite.
The frontend's Nginx forwards /api to the API, so the browser always uses the frontend origin.

## Resources and limits

`render.yaml` in this repo defines two free Docker web services and one free Postgres 17 database,
all in Singapore. Every Git service explicitly follows `develop` and deploys only after CI passes.
Free web services sleep after 15 idle minutes; first access can take about a minute per service.
The workspace shares 750 free web-service hours/month. Free Postgres expires 30 days after
creation, has no managed backups, and is intended only for staging. It is not permanent free hosting.
Do not upload important production records to this test database; choose a durable paid plan before
keeping real learning records long term. No paid resource or payment method is required by this YAML.
Actual quotas/verification are controlled by Render; review its creation screen before submitting.

## Prerequisites

1. Create/sign in to Render. Authorize Render's GitHub access to **only** the two English Reps repos.
2. Merge the frontend and backend `feature/render-staging` MRs into `develop` after CI passes.
3. Connect the Render integration in this conversation if you want the assistant to create services
   and inspect deployment status. Without that connection, use the Blueprint flow below.

## Blueprint setup

Render Dashboard → New → Blueprint → select `english-reps-backend` → Branch `develop` →
Blueprint path `render.yaml` → review the three resources, region and free plans → Deploy.
A repository file prepares the resources; it does not create them until this action is completed.

`ALLOWED_ORIGINS` must be a JSON array containing the **actual frontend HTTPS origin**, without a
trailing slash. If Render hasn't assigned that URL during initial setup, use the deny-only placeholder
`["https://staging-not-configured.invalid"]` temporarily. The API health checks can start, but login
is deliberately denied until you replace this value. After the frontend URL appears:

API service → Environment → ALLOWED_ORIGINS → set `["https://<actual-frontend-host>"]` → Save,
rebuild and deploy. Never add wildcard or arbitrary customer origins.

The frontend's `API_UPSTREAM` references the API's `RENDER_EXTERNAL_URL`. Verify it resolved to the
API's actual HTTPS URL; if the dashboard reports a missing reference, set that exact returned URL
in frontend → Environment → API_UPSTREAM. Free API services cannot receive private-network HTTP
traffic, so use the HTTPS public API address rather than its internal hostport. The API's DATABASE_URL
uses the database's **internal** URL; external Postgres access is disabled (`ipAllowList: []`).

Cookies use Secure + HttpOnly + SameSite=Lax + __Host- names. The proxy preserves Set-Cookie and
Origin, verifies upstream TLS and sends its requests to the configured API hostname. Browser JS
contains no database URL or backend credentials. Backend registration/login remains email/password.

## Startup and migration

Render Docker services run `sh /app/scripts/start-render.sh`. It validates PORT, runs Alembic, then
executes Uvicorn on 0.0.0.0:$PORT. This works without the paid pre-deploy feature. A PostgreSQL
advisory lock serializes migrations during overlapping starts; errors prevent the API from serving.
Managed `postgres://` and `postgresql://` URLs are normalized to SQLAlchemy's asyncpg driver;
`sslmode` is translated to asyncpg's `ssl` option while retaining encoded credentials.
The frontend Nginx template substitutes only PORT and API_UPSTREAM, leaving Nginx variables intact.
Existing local Compose defaults (port 80 inside Nginx, api:8000) continue to work.

## Acceptance on the actual deployed URLs

1. Frontend healthz and API /api/v1/health/ready return 200; reload /login and /listening directly.
2. On a phone, register an account and answer one vocabulary quiz and one listening question.
3. Log into the same account on a computer; My Progress shows both records and the same counts.
4. Log in with a second account; it sees none of the first account's records.
5. Log out, log in again and refresh; confirmed progress persists. Retry a failed submission; no
   double count. A third-party Origin is rejected, and cookie flags remain Secure/HttpOnly.
6. Mark the test database creation/expiration date and check usage in Render's billing screen.

Do not report a working public site until Render returns actual service URLs and successful deploys.
Until then, local Docker smoke results are not proof of live deployment or device testing.

## References

- https://render.com/docs/blueprint-spec
- https://render.com/docs/free
- https://render.com/docs/environment-variables
- https://render.com/docs/configure-environment-variables
- https://render.com/docs/web-services
