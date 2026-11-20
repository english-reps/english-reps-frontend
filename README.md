# English Reps frontend

React + TypeScript + Vite + React Router application for TOEIC self-learners.
Retains 1,000 source vocabulary words, 30 original listening questions, cards/quizzes,
search/filter/pagination and wrong-answer practice. Adds account login and private cross-device progress.

## Run the full stack

The backend repository owns PostgreSQL, migrations, API and Compose. Clone both repositories
side by side and use the `feature/account-progress-sync` branch in both until the MRs merge:

```sh
cd ../english-reps-backend
cp .env.example .env
# Set matching local database credentials in .env.
docker compose --profile dev up --build --wait
```

Open `http://localhost:3007`. Vite serves React and proxies `/api` to FastAPI:8000.
No API hostname or secret is baked into browser assets. For compiled assets behind Nginx:

```sh
docker compose --profile dev stop frontend
docker compose --profile prod up --build --wait
# Open http://localhost:8080
```

The local stack is HTTP and binds web ports to 127.0.0.1. It is not a public deployment.
The current public `chatgpt.site` stays on the previous static release while hosting is undecided.

## Frontend development

Node.js 22+; API running separately at 127.0.0.1:8000, or set `API_PROXY_TARGET` for Vite:

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
```

`npm run build` emits `dist/` with hashed assets. `docker/default.conf.template` handles direct SPA routes,
`/api` proxying, immutable assets, uncached HTML, private API no-store and security headers.
Dockerfile stages: `development` (Vite), `build`, `production` (Nginx).
If the environment uses a corporate HTTPS proxy, pass its trusted CA as an optional BuildKit
`build_ca` secret rather than disabling TLS verification.

## Pages and behavior

- `/practice`: 10-word cards/quizzes, unit/review filters, ratings and account mastery.
- `/listening`: 30 original Part 2 style questions, topic/review filters, 0.8/1/1.15× voice,
  playback before answering, bilingual transcript/explanation, round score and missed-question replay.
- `/library`: English/Chinese search, unit/part-of-speech/starred filters, star toggles for unfamiliar
  words, and 20-word pagination.
- `/login`, `/register`: email/password (12–128 characters), validation and cookie session.
- `/progress`: protected account summary and wrong/starred review answers.

Guests can browse and practice; account progress and starred unfamiliar words are saved only after login.
Failed saves display an explicit retry and reuse the original event ID. The server grades answers and
deduplicates events. Progress refreshes when the window regains focus; manual refresh is also available.
Logout removes account data from React state. Session cookies are HttpOnly, CSRF tokens remain in memory,
and private progress is not cached in localStorage. Backend health is shown in the footer.

Audio uses the browser/OS English speech engine, with cancellation, startup/playback timeouts and
unsupported guidance. Tests simulate those events; physical-device audio quality is not verified.
Questions are original self-study material, not ETS official items or confidential exam content.

## Data, checks and integration

`data/vocabulary.json` and `data/listening.js` preserve the bundled offline fallback and test fixtures;
application pages load the live catalog from the backend API, which reads `data/vocabulary.json` and
`data/listening.json` from the backend repository. Do not change stable IDs. `scripts/import-vocabulary.py`
can regenerate the vocabulary fixture from PDF text.
Vitest/Testing Library tests cover routing/login/logout, privacy cleanup, failed-save retries,
listening playback gating, library star toggling/filtering, catalog completeness, quiz choices, and API errors/CSRF.
GitHub Actions checks TypeScript, tests and the production build; recommended required check:
`frontend-checks` (GitHub Settings → Rules → Rulesets → Require status checks).

This frontend MR depends on the existing listening MR, which depends on the vocabulary MR.
Merge in order and retarget each dependent MR; `master` remains formal releases and `develop`
integration. No automatic public deployment is configured.

See [architecture](docs/architecture.md) and [API contract](docs/api-contract.md), mirrored in the backend.

## Render staging deployment

See [Render staging guide](docs/render-staging.md) for hosted HTTPS URLs without renting a server.
The backend repo owns `render.yaml`; both services follow `develop` after CI passes.
This requires a Render account and GitHub repository authorization; a committed YAML file alone
does not create a running site. The free PostgreSQL database expires after 30 days.
