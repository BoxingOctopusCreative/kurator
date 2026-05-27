# Kurator

Kurator is a collection tracker: a **Go (Fiber) REST API**, a **Next.js** web app (App Router), **PostgreSQL**, **Meilisearch** for search, optional **S3-compatible** object storage for covers and assets, and optional **Valkey (Redis)** for a durable outbound notification queue. Production traffic is fronted by **Traefik** (TLS, routing); the repo also ships an **infra** Compose file for local dependencies.

---

## Prerequisites

- **Go** (see `api/go.mod` `go` directive; currently **1.25**)
- **Node.js 22+** for the web app (see `web/package.json` engines if present)
- **Podman** or **Docker** with Compose v2 for containers (this workspace assumes **Podman** for local validation; `docker compose` and `podman compose` are interchangeable for the examples below)

---

## Repository layout

| Path | Role |
|------|------|
| `api/` | Go API (`cmd/api`), internal packages, SQL migrations, OpenAPI `docs/swagger.json`, `Makefile` |
| `web/` | Next.js app (`app/`, `components/`, Vitest unit tests) |
| `docker-compose.yml` | **Production-style** stack: prebuilt images from GHCR, **Traefik** labels, external `shared-network`, Meilisearch, Valkey, optional Swagger UI sidecar |
| `infra/docker-compose.yml` | **Local dependencies**: Postgres, Meilisearch, Swagger UI, Valkey |
| `infra/nginx/nginx.conf` | **Optional** reference config for load-balancing multiple Next replicas (not wired into `infra/docker-compose.yml` today) |
| `Makefile` | Shortcuts: `api-build`, `api-test`, `web-test`, etc. |

---

## How the web app talks to the API

- In the **browser**, the client uses same-origin paths under **`/api/v1/...`** and **`/api/v2/...`**. Next.js proxies those to the real API (`web/app/api/v1/[[...path]]/route.ts`, `web/app/api/v2/[[...path]]/route.ts`) so the **session cookie** stays on the web origin (important for production and for local dev on `http://localhost:3000`).
- **Server-side** rendering and server actions resolve the upstream API with **`API_INTERNAL_URL`** (or **`API_PROXY_TARGET`**), then **`NEXT_PUBLIC_API_URL`** as fallback (see `web/lib/apiUrl.ts`).
- **Native apps and other non-browser clients** should call the **Go API host** directly (for example `https://api.example.com/api/v1/...`). Authenticate with **`Authorization: Bearer <session_token>`**; the opaque **`session_token`** is returned in JSON from **`POST /api/v1/auth/register`**, **`POST /api/v1/auth/login`** (when 2FA is not required), **`POST /api/v1/auth/login/2fa`**, and **`POST /api/v1/auth/webauthn/login/finish`**, in addition to **`Set-Cookie: kurator_session`** for clients that use cookies. **Passkeys** require the WebAuthn RP ID to match the site host (`PUBLIC_WEB_BASE_URL`); add passkeys while signed in via **`/me/webauthn/register/*`** (see App Settings on web). Details and OpenAPI models: **`api/docs/swagger.json`** (`BearerToken`, `RegisterResponse`, `LoginResponse`, `Login2FAResponse`). If both cookie and Bearer are sent, the **cookie takes precedence** (same as the API middleware).
---

## Production stack (`docker-compose.yml` at repo root)

This file targets a host that already has an **external** Docker network (here: `shared-network`) and **Traefik** with TLS (e.g. Let’s Encrypt). It runs:

| Service | Role |
|---------|------|
| **api** | REST API on port 8080 inside the network; routes like `api.kuratorapp.cc` via Traefik labels |
| **web** | Next.js on port 3000; `kuratorapp.cc` via Traefik; `API_INTERNAL_URL` points at the API container |
| **meilisearch** | Search index |
| **valkey** | Redis-compatible store for the notify queue (beta / registration emails, retries) |
| **swagger-ui** | Serves OpenAPI from a mounted `swagger.json` (e.g. `swagger.kuratorapp.cc`) |

Images default to **`ghcr.io/boxingoctopuscreative/kurator-api`** and **`kurator-web`** tags (`:latest`). Supply secrets and integration keys via environment (see service `environment` blocks): `DATABASE_URL`, `AUTH_JWT_SECRET`, Meilisearch keys, S3, Mailgun, Sentry, Turnstile, etc.

### Cloudflare Turnstile (production web container)

- On the **`web`** service, set **`CLOUDFLARE_TURNSTILE_ENABLED=true`** and **`CLOUDFLARE_TURNSTILE_SITEKEY`** (read at **request time**). **`NEXT_PUBLIC_CLOUDFLARE_*`** is only effective if it was present at **`next build`** (inlined into the client bundle); setting it only on the running container is not enough unless you also pass it as a **web image build-arg**.
- The **API** needs **`CLOUDFLARE_TURNSTILE_ENABLED`** and **`CLOUDFLARE_TURNSTILE_SECRETKEY`** to verify tokens. Add your production hostname in the Turnstile widget’s host allowlist in the Cloudflare dashboard.

---

## Local development (dependencies in Compose, API + web on the host)

### 1. Start backing services

From the repository root (uses **Podman** by default; override with `COMPOSE='docker compose'` if needed):

```bash
make infra-up
# equivalent: podman compose -f infra/docker-compose.yml up -d
```

Stop with `make infra-down`. Status: `make infra-ps`. Logs: `make infra-logs` (optional `SVC=postgres`).

This starts **Postgres** (port **5432** by default), **Meilisearch** (**7700**), **Valkey** (**6379**), and **Swagger UI** (host port **8081** by default, `SWAGGER_UI_PORT`). Object storage is not run locally; point the API at your **production S3** (or R2) bucket via `S3_*` env or `[s3]` in `api/kurator.toml` (see `api/kurator.example.toml`).

Schema: start the API once (it applies bundled migrations on boot), or use `go run ./cmd/migrate` from `api/` with `DATABASE_URL` set.

### 2. API

Set env once (same for Air or `go run`):

```bash
cd api
export DATABASE_URL='postgres://kurator:kurator@localhost:5432/kurator?sslmode=disable'
export MEILISEARCH_HOST='http://localhost:7700'
export MEILISEARCH_API_KEY='dev_master_key'
export MEILISEARCH_INDEX='kurator_items'
export AUTH_JWT_SECRET='your-local-secret'
export PUBLIC_WEB_BASE_URL='http://localhost:3000'
# Optional OAuth (register redirect URIs: $PUBLIC_WEB_BASE_URL/api/v1/auth/oauth/{google|discord}/callback):
# export GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=...
# export DISCORD_OAUTH_CLIENT_ID=... DISCORD_OAUTH_CLIENT_SECRET=...
export REDIS_URL='redis://localhost:6379/0'
# S3 (production bucket or R2; required for cover/avatar uploads):
# export S3_BUCKET=... S3_ENDPOINT=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... S3_PUBLIC_BASE_URL=...
```

**Live reload (recommended):** install [Air](https://github.com/air-verse/air) once, then run from `api/` or the repo root:

```bash
go install github.com/air-verse/air@latest   # ensure $(go env GOPATH)/bin is on PATH
make dev          # from api/
# or: make api-dev   # from repo root
```

Config: `api/.air.toml` (rebuilds on `.go` / `.toml` changes; ignores `*_test.go` and `tmp/`).

**Without Air:**

```bash
go run ./cmd/api
```

### 3. Web

```bash
cd web
npm ci
export NEXT_PUBLIC_API_URL='http://127.0.0.1:8080'
export API_INTERNAL_URL='http://127.0.0.1:8080'
npm run dev
```

Open **http://localhost:3000**. Ensure the API **`CORS_ORIGINS`** includes the web origin if you ever call the API **directly** from the browser; with the default proxy pattern, same-origin `/api/v1` and `/api/v2` avoid that for same-site dev.

### 4. Tests

```bash
make api-test    # go test ./... in api/
make web-test    # npm test (Vitest) in web/
```

**API:** Go tests colocated as `*_test.go` under `api/internal/...` (and similar). **Web:** Vitest + Testing Library, `**/*.{test,spec}.{ts,tsx}`, `web/vitest.config.ts` and `vitest.setup.ts`. CI runs the same commands with `go test -count=1` and `npm ci && npm test` (see `.github/workflows/ci-release.yml`).

---

## GitHub Actions

| Workflow | When it runs | Purpose |
|----------|----------------|----------|
| **`ci-release.yml`** | PRs, pushes to `main`, manual | Skip if latest commit is `CI:` or `INFO:`; **unit tests** (Go + Node 22 web); on **`main`** after tests: SemVer **tag + release**, API cross-build artifacts, optional **S3** upload of `web/content/privacy-policy.md`, **GHCR** images for `api` and `web` |
| **`snyk.yml`** | PR, `main`, weekly, manual | Same skip rule; **fork PRs** skip Snyk; **`snyk test`** in `api/` and `web/`, **`snyk code test`**, **`snyk monitor`** on `main` pushes |
| **`portainer-redeploy-on-release.yml`** | GitHub **Release published** | Skip by tag commit prefix; **Portainer** stack redeploy via API; optional **Discord** webhook |

Details and conventions (concurrency, secrets, build-args) are summarized in **`.cursor/rules/web-app-stack-standard.mdc`**.

---

## Makefile shortcuts (repo root)

| Command | Description |
|---------|-------------|
| `make help` | Lists shortcuts |
| `make infra-up` / `make infra-down` | Start/stop local deps (`infra/docker-compose.yml`) |
| `make api-dev` | Live-reload API via Air (`make -C api dev`) |
| `make api-build` | Build API for current platform → `api/bin/kurator-api` |
| `make api-build-macos` / `api-build-linux` / `make api-build-all` | Cross-compilation helpers |
| `make api-test` | Go tests in `api/` |
| `make api-clean` | Remove `api/bin/` |
| `make web-test` | Vitest in `web/` |

See `make -C api help` for API-only targets (including `swagger` notes for OpenAPI / Swagger UI).

---

## OpenAPI / Swagger

- Spec file: **`api/docs/swagger.json`** (OpenAPI 2.0). Describes **`SessionCookie`** (`kurator_session`) and **`BearerToken`** (`Authorization: Bearer <session_token>`) as alternative client credentials; auth responses document **`session_token`** for register, login, and login/2fa.
- Local UI with infra compose: **http://localhost:8081** (unless `SWAGGER_UI_PORT` overrides); compose mounts the repo’s `swagger.json`.

---

## First-time auth

Register from the UI or **`POST /api/v1/auth/register`**. Signed-in sessions use the same opaque token in two ways: an HTTP-only **`kurator_session`** cookie (normal browser flow through the Next.js proxy) **and** a JSON **`session_token`** field on successful **register**, **login** (when 2FA is off), and **login/2fa** responses so native or scripted clients can send **`Authorization: Bearer <session_token>`** without cookies. **`POST /api/v1/auth/logout`** revokes the session for either mechanism. JWTs are still used only for short-lived flows (e.g. pending 2FA, beta unlock), not as the primary session mechanism.

---

## Legacy Nginx sample

`infra/nginx/nginx.conf` is a sample upstream for **two** Next.js replicas (`kurator-web-1`, `kurator-web-2`). It is not referenced by the current `infra/docker-compose.yml`; keep it if you assemble a custom local or self-hosted stack.

---

## Engineering standard (stack + integrations)

Team and agent defaults for architecture, third-party wiring (S3, Turnstile, Sentry), **testing** (Go + Vitest), and **GitHub Actions** live in **`.cursor/rules/web-app-stack-standard.mdc`**. Copy that file into other repos’ `.cursor/rules/` if you want the same standard elsewhere.
