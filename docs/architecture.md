# English Reps v1 architecture

## Product and scope
For Traditional Chinese speaking TOEIC self-learners: retain the 1,000-word bank,
30 original listening questions, vocabulary cards/quizzes and wrong-answer review.
Add email/password registration, cookie sessions and private progress shared across devices.
No email delivery, password reset, social login, payments or hosted deployment in this change.
The existing public static Site stays on its current release until a host is selected.

## Repositories and branches
Keep `english-reps-frontend` and `english-reps-backend` as separate repositories.
`master` is production; `develop` is integration. Open feature MRs without merging.
The React frontend branch depends on the existing listening MR (which depends on the vocabulary MR).
Backend starts at `develop`. The backend owns Compose; clone the frontend beside it or set FRONTEND_PATH.
Use matching feature branches while reviewing this contract. No history is rewritten.

## Stack and boundaries
React + TypeScript + Vite + React Router, plain accessible components with the existing green/cream CSS.
FastAPI + Pydantic settings + SQLAlchemy async/asyncpg, PostgreSQL, Alembic, uv.
Vitest/Testing Library on the frontend; Ruff, mypy, pytest on the backend.
Development: browser -> Vite :3007 -> /api proxy -> FastAPI :8000 -> PostgreSQL.
Production-shaped local stack: browser -> Nginx :8080 -> static React files or /api -> FastAPI.
Same-origin cookies and explicit Origin checks; no CORS middleware is needed.

## Data and privacy
- users: UUID, normalized unique email, Argon2 password hash, creation time.
- sessions: hashed opaque token, user FK, hashed CSRF token, expiry. Raw tokens are cookies only.
- catalog files (`data/vocabulary.json`, `data/listening/part1..4.json`, `data/reading/part5..7.json` in backend): stable word/listening/reading IDs and content loaded and validated in memory by the API.
- study_events: user + client event UUID, canonical request and server-graded result; immutable, idempotent.
- progress: user + item, status, quiz attempts/correct count, updated time.
User -> many sessions/events/progress; PostgreSQL stores only user accounts, sessions, auth rate limits and learning progress.
Every private query uses the authenticated user ID from the server, never a client-supplied owner.
Catalog is self-study material, not a confidential exam bank. Listening uses device speech synthesis.

## Authentication and progress
HttpOnly SameSite=Lax session and CSRF cookies, Secure in production. CSRF bootstrap returns a
random token; every mutation checks the same-origin Origin and X-CSRF-Token against the cookie,
then (when authenticated) the session-bound CSRF hash. Registration/login rotate both tokens.
Passwords use Argon2; sessions expire and logout revokes the database row. Login attempts use a
bounded database rate-limit table so limits apply across API workers. Never log passwords/tokens.
Progress events are graded by the backend. Event UUID retries return the existing result without
incrementing counters; changed reuse returns 409. SQL updates increment counters atomically.
The UI waits for server confirmation, retains failed submissions for an explicit retry, and refreshes
progress on focus. Network errors never appear as successful saves. Logout clears in-memory account data.
No private progress is put in localStorage.

## Pages
- /practice: vocabulary cards/quizzes and mastery stats.
- /listening: TOEIC Listening Parts 1–4 practice, playback gate, transcript and review.
- /reading: TOEIC Reading Parts 5–7 practice, passages, explanations and review.
- /library: searchable, paginated vocabulary with unit/part-of-speech/unfamiliar filters and star toggles.
- /login, /register: credentials, validation, session creation.
- /progress: private summary and wrong/starred review answers.
- /*: not-found; shared loading/error/retry UI and session-expiry handling.
Guests can browse and practice without saving; login is required for account progress.

## Delivery and validation
Compose waits for database health -> one-shot migration -> API readiness -> web/dev frontend.
Database storage is a named volume, database has no host port. Secrets come from ignored .env;
.env.example contains local-only placeholders. CI uses PostgreSQL 17 and verifies upgrade, downgrade,
upgrade, auth/CSRF, ownership, idempotency, grading and API behavior. Frontend CI typechecks,
runs Vitest and builds. Full Compose smoke checks run before MR creation when Docker is available.
Before real hosting: provision HTTPS, production origins/Secure cookies, backups with restore testing,
monitoring, email/reset policy and required branch checks. No production hosting is selected here.

The API service has no host port. Its forwarded-client-IP trust is restricted by this Compose
network boundary: both Vite and Nginx overwrite X-Forwarded-For from the socket peer.
If deploying the API outside this topology, configure a precise trusted-proxy list first.
Port 8080 is configurable through WEB_PORT; keep ALLOWED_ORIGINS in sync when changing it.
