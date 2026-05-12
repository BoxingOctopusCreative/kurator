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
| `infra/docker-compose.yml` | **Local dependencies**: Postgres, MinIO (+ bucket init), Meilisearch, Swagger UI, Valkey |
| `infra/nginx/nginx.conf` | **Optional** reference config for load-balancing multiple Next replicas (not wired into `infra/docker-compose.yml` today) |
| `Makefile` | Shortcuts: `api-build`, `api-test`, `web-test`, etc. |

---

## How the web app talks to the API

- In the **browser**, the client uses same-origin paths under **`/api/v1/...`**. Next.js proxies those to the real API (`web/app/api/v1/[[...path]]/route.ts`) so the **session cookie** stays on the web origin (important for production and for local dev on `http://localhost:3000`).
- **Server-side** rendering and server actions resolve the upstream API with **`API_INTERNAL_URL`** (or **`API_PROXY_TARGET`**), then **`NEXT_PUBLIC_API_URL`** as fallback (see `web/lib/apiUrl.ts`).

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

Images default to **`ghcr.io/boxingoctopuscreative/kurator-api`** and **`kurator-web`** tags (`:latest`). Supply secrets and integration keys via environment (see service `environment` blocks): `DATABASE_URL`, `AUTH_JWT_SECRET`, Meilisearch keys, S3, Mailgun, Sentry, Turnstile, LaunchDarkly client id, etc.

---

## Local development (dependencies in Compose, API + web on the host)

### 1. Start backing services

From the repository root (Podman shown; use `docker compose` if you prefer):

```bash
podman compose -f infra/docker-compose.yml up -d
```

This starts **Postgres** (port **5432** by default), **MinIO** (**9000**), **Meilisearch** (**7700**), **Valkey** (**6379**), **Swagger UI** (host port **8081** by default, `SWAGGER_UI_PORT`), and a one-shot **minio-init** that creates a `kurator-covers` bucket.

Schema: start the API once (it applies bundled migrations on boot), or use `go run ./cmd/migrate` from `api/` with `DATABASE_URL` set.

### 2. API

```bash
cd api
export DATABASE_URL='postgres://kurator:kurator@localhost:5432/kurator?sslmode=disable'
export MEILISEARCH_HOST='http://localhost:7700'
export MEILISEARCH_API_KEY='dev_master_key'
export MEILISEARCH_INDEX='kurator_items'
export AUTH_JWT_SECRET='your-local-secret'
export REDIS_URL='redis://localhost:6379/0'
# Optional S3 (match MinIO from infra compose):
# export S3_BUCKET=... S3_ENDPOINT=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... S3_PUBLIC_BASE_URL=...
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

Open **http://localhost:3000**. Ensure the API **`CORS_ORIGINS`** includes the web origin if you ever call the API **directly** from the browser; with the default proxy pattern, same-origin `/api/v1` avoids that for same-site dev.

### 4. Tests

```bash
make api-test    # go test ./... in api/
make web-test    # npm test (Vitest) in web/
```

---

## Makefile shortcuts (repo root)

| Command | Description |
|---------|-------------|
| `make help` | Lists shortcuts |
| `make api-build` | Build API for current platform → `api/bin/kurator-api` |
| `make api-build-macos` / `api-build-linux` / `make api-build-all` | Cross-compilation helpers |
| `make api-test` | Go tests in `api/` |
| `make api-clean` | Remove `api/bin/` |
| `make web-test` | Vitest in `web/` |

See `make -C api help` for API-only targets (including `swagger` notes for OpenAPI / Swagger UI).

---

## OpenAPI / Swagger

- Spec file: `api/docs/swagger.json`
- Local UI with infra compose: **http://localhost:8081** (unless `SWAGGER_UI_PORT` overrides); compose mounts the repo’s `swagger.json`.

---

## First-time auth

Register from the UI or `POST /api/v1/auth/register`. Signed-in sessions use an HTTP-only **`kurator_session`** cookie. With the Next.js proxy, that cookie is set for the **web** origin in normal use; JWTs are used for short-lived flows (e.g. pending 2FA), not as the primary session mechanism.

---

## Legacy Nginx sample

`infra/nginx/nginx.conf` is a sample upstream for **two** Next.js replicas (`kurator-web-1`, `kurator-web-2`). It is not referenced by the current `infra/docker-compose.yml`; keep it if you assemble a custom local or self-hosted stack.
