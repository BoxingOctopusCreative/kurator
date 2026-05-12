# Kurator Project Memory

## Overview

Kurator is a collection tracker: users catalog games, music, books, movies, TV, anime, comics, and manga with category-specific metadata, consumption status, lists, wishlists, and light social features (follows, activity). Stack: **Go Fiber API**, **Next.js** (App Router), **PostgreSQL**, **Meilisearch**, optional **S3** (covers, avatars, optional privacy policy object), **Valkey** for a durable notification queue, **Mailgun** for email, **Sentry**, **Cloudflare Turnstile**, **LaunchDarkly** (web client SDK).

## Architecture

| Layer | Details |
|-------|---------|
| **API** | Go 1.25, Fiber v2, Cobra CLI, pgx, bundled SQL migrations on startup, optional Meilisearch indexer, optional S3 image service |
| **Web** | Next.js 16, React 19, TypeScript, Tailwind 4; Turbopack for `dev` / `build`; Vitest + Testing Library for unit tests |
| **Browser → API** | Same-origin **`/api/v1/*`** proxied by Next (`web/app/api/v1/[[...path]]/route.ts`) so session cookies stay on the web origin; server code uses `API_INTERNAL_URL` / `NEXT_PUBLIC_API_URL` (`web/lib/apiUrl.ts`) |
| **Production edge** | Root **`docker-compose.yml`**: Traefik labels on `api`, `web`, `swagger-ui`; external **`shared-network`**; GHCR images; Valkey + Meilisearch colocated |
| **Local dependencies** | **`infra/docker-compose.yml`**: Postgres, MinIO (+ init job), Meilisearch, Swagger UI, Valkey (Compose project name `kurator-infra`) |
| **Optional** | **`infra/nginx/nginx.conf`** — sample load balancer for two Next replicas; not wired into current infra compose |

## Project structure (high level)

```
kurator/
├── api/
│   ├── cmd/api/           # HTTP server entry
│   ├── cmd/migrate/     # DATABASE_URL-only migrations
│   ├── cmd/betakeygen/  # Private beta key CLI
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
└── Makefile              # api-* and web-test entrypoints
```

## Auth and security

- **Sessions**: HTTP-only **`kurator_session`** cookie; opaque token stored hashed in **`sessions`** table (not “JWT as primary auth”).
- **JWT**: Short-lived tokens for **pending 2FA** after password step; **beta unlock** cookie when beta gate is enabled (`AUTH_JWT_SECRET`).
- Passwords: bcrypt; optional **TOTP** 2FA.
- **Turnstile** on sensitive auth routes when enabled.
- CORS, parameterized SQL, validation package, rate limits where configured.

## Major API surface (prefix `/api/v1`)

Auth (`/auth/*`, login/register/logout/2FA, password recovery, beta flows), **`/me`**, collections, items, lists, wishlists, search, metadata lookup, images, notifications, follows / social. Full list in `api/docs/swagger.json`.

## Data model notes

- **Item categories** include: `game`, `music`, `book`, `movies`, `tv`, `anime`, `comic_book`, `manga` (see code and migrations for canonical enums).
- **Consumption**: `pending` | `done` with category-specific UI labels in `web/lib/consumptionLabels.ts`.
- **Collections**: visibility, optional pinned category, cover art.

## Development commands

- API: `cd api && go run ./cmd/api` or `make api-build` then `./bin/kurator-api`
- Web: `cd web && npm run dev` (Turbopack)
- Full dependency stack (local): `podman compose -f infra/docker-compose.yml up -d` (or `docker compose`)
- Tests: `make api-test`, `make web-test`

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
