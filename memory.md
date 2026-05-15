# Kurator Project Memory

## Default web stack (org standard)

Reusable conventions for this and future web + API apps live in **`.cursor/rules/web-app-stack-standard.mdc`** (always-on in Cursor): core split (API + Next.js), same-origin session proxy, integration boundaries (**S3**, **Turnstile**, **Sentry**, **LaunchDarkly**), **testing suites** (Go + Vitest), and **GitHub Actions** patterns (`ci-release`, `snyk`, Portainer redeploy).

## Overview

Kurator is a collection tracker: users catalog games, music, books, movies, TV, anime, comics, and manga with category-specific metadata, consumption status, lists, wishlists, and light social features (follows, activity). Stack: **Go Fiber API**, **Next.js** (App Router), **PostgreSQL**, **Meilisearch**, optional **S3** (covers, avatars, optional privacy policy object), **Valkey** for a durable notification queue, **Mailgun** for email, **Sentry**, **Cloudflare Turnstile**, **LaunchDarkly** (web client SDK).

## Architecture

| Layer | Details |
|-------|---------|
| **API** | Go 1.25, Fiber v2, Cobra CLI, pgx, bundled SQL migrations on startup, optional Meilisearch indexer, optional S3 image service |
| **Web** | Next.js 16, React 19, TypeScript, Tailwind 4; Turbopack for `dev` / `build`; Vitest + Testing Library for unit tests |
| **Browser → API** | Same-origin **`/api/v1/*`** proxied by Next (`web/app/api/v1/[[...path]]/route.ts`) so session cookies stay on the web origin; server code uses `API_INTERNAL_URL` / `NEXT_PUBLIC_API_URL` (`web/lib/apiUrl.ts`) |
| **Native / direct API** | Same **`sessions`** table: send **`Authorization: Bearer <session_token>`**; obtain **`session_token`** from JSON on **`POST /auth/register`**, **`POST /auth/login`** (after password when 2FA off), or **`POST /auth/login/2fa`**. Cookie wins if both cookie and Bearer are sent (`api/internal/middleware/session_token.go`). OpenAPI: **`api/docs/swagger.json`** (`BearerToken`, `RegisterResponse`, `LoginResponse`, `Login2FAResponse`). |
| **Production edge** | Root **`docker-compose.yml`**: Traefik labels on `api`, `web`, `swagger-ui`; external **`shared-network`**; GHCR images; Valkey + Meilisearch colocated |
| **Local dependencies** | **`infra/docker-compose.yml`**: Postgres, Meilisearch, Swagger UI, Valkey (Compose project name `kurator-infra`). S3: use production bucket credentials in dev, not a local object store. |
| **Optional** | **`infra/nginx/nginx.conf`** — sample load balancer for two Next replicas; not wired into current infra compose |

## Project structure (high level)

```
kurator/
├── api/
│   ├── cmd/api/           # HTTP server entry
│   ├── cmd/migrate/     # DATABASE_URL-only migrations
│   ├── internal/
│   │   ├── config/, handler/, middleware/, migrate/
│   │   ├── repository/, service/, validation/, mailgun/, notifyqueue/, …
│   ├── migrations/       # SQL migrations (applied by API on boot)
│   └── docs/swagger.json # OpenAPI 2.0
├── web/
│   ├── app/              # App Router, API proxy route
│   ├── components/, lib/
│   └── content/privacy-policy.md  # Source for /privacy (see web/lib/privacyPolicyMarkdown.ts)
├── docker-compose.yml    # Production-oriented Traefik stack
├── infra/docker-compose.yml
├── Makefile              # api-* and web-test entrypoints
├── memory.md             # Agent / team project memory
└── memory-flutter-ui-port.md  # Flutter UI + direct API auth notes
```

## Auth and security

- **Sessions**: Opaque token stored hashed in **`sessions`** (not “JWT as primary auth”). Delivered as HTTP-only **`kurator_session`** cookie for browsers (via Next proxy) **and** as JSON **`session_token`** on successful **register / login / login/2fa** for clients that cannot rely on cookies.
- **Bearer**: Protected routes accept **`Authorization: Bearer <session_token>`** with the same semantics as the cookie. Resolution order: **cookie first**, then Bearer (`SessionRawFromRequest` in `api/internal/middleware/`).
- **JWT**: Short-lived tokens for **pending 2FA** after password step; **`kurator_beta_unlock`** cookie when `BETA_ACCESS_REQUIRED` is on (set after the user opens an approved **email invite** link, consumed at register). No shared beta keys. Plan separately if mobile must complete gated beta without a WebView.
- Passwords: bcrypt; optional **TOTP** 2FA.
- **Turnstile** on sensitive auth routes when enabled.
- **CORS**: `Authorization` is an allowed header when the browser calls the API origin directly (`api/cmd/api/main.go`); same-origin web traffic still prefers the Next proxy.
- Parameterized SQL, validation package, rate limits where configured.

## Major API surface (prefix `/api/v1`)

Auth (`/auth/*`, login/register/logout/2FA, password recovery, beta flows), **`/me`**, collections, items, lists, wishlists, search, metadata lookup, images, notifications, follows / social. Full contract and **`SessionCookie` / `BearerToken`** security: **`api/docs/swagger.json`**.

## Data model notes

- **Item categories** include: `game`, `music`, `book`, `movies`, `tv`, `anime`, `comic_book`, `manga` (see code and migrations for canonical enums).
- **Consumption**: `pending` | `done` with category-specific UI labels in `web/lib/consumptionLabels.ts`.
- **Collections**: visibility, optional pinned category, cover art.

## Development commands

- API: `make api-dev` (Air live reload; `api/.air.toml`) or `cd api && go run ./cmd/api`; release binary: `make api-build` then `./bin/kurator-api`
- Web: `cd web && npm run dev` (Turbopack)
- Full dependency stack (local): `make infra-up` / `make infra-down` (`infra/docker-compose.yml`; default `podman compose`)
- Tests: `make api-test` (`go test ./...` in `api/`), `make web-test` (`vitest run` in `web/`); CI uses `go test ./... -count=1` and `npm ci && npm test` (`.github/workflows/ci-release.yml`)

## Deployment (production compose)

- Services bind on an internal network; **Traefik** publishes **api.**, **www.** / apex web host, **swagger.** as configured in labels.
- Managed Postgres (e.g. Aiven): `DATABASE_URL` with TLS; optional **`PGSSLROOTCERT`** volume for verify-full.
- Meilisearch data volume **`kurator_meili_data`** on the production compose file.

## Monitoring

- **Sentry** in API (Fiber) and web (Next SDK).
- **`GET /health`** on the API.

## UI conventions (for agents)

- Prefer **borderless icon actions** over bordered icon buttons unless accessibility or strong affordance needs a border.
- **Modals**: no full-page dark scrim; transparent capture layer; floating panel with `shadow-dropdown` / layered shadows (`globals.css`).
- **Copy**: page titles and nav use **Title Case** (short words like *to*, *with*, *and* lowercase when not first word).

## Privacy policy

- **`web/content/privacy-policy.md`** backs `/privacy` (ReactMarkdown + Tailwind Typography); production may load from S3 (`web/lib/privacyPolicyMarkdown.ts`). Update that markdown when user-visible data collection or integrations change.

## Implementation notes

- Handlers → services → repositories; Fiber middleware for auth and recovery.
- Image optimization choices for remote covers as implemented in the web app.
- **Notify queue**: Valkey-backed queue for outbound notifications (retries / DLQ pattern in `api/internal/notifyqueue`).
