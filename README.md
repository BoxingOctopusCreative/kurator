# Kurator

Kurator is a collection tracker with a **Go (Fiber) API**, **Next.js** web UI, **PostgreSQL**, **Meilisearch**, and **Nginx** (load-balanced Next.js replicas) in Docker.

---

## Prerequisites

- **Docker** and **Docker Compose** (recommended for running everything), or
- **Go 1.23+** and **Node.js 22+** if you prefer to run the API and web locally against your own Postgres/Meilisearch.

---

## Run the full stack (Docker)

From the repository root:

```bash
docker compose up --build -d
```

### What starts

| Service        | Role |
|----------------|------|
| **postgres**   | Database; SQL migrations from `api/migrations` run on first data directory init. |
| **meilisearch**| Search index. |
| **kurator-api**| REST API on host **8080**. |
| **kurator-web-1 / kurator-web-2** | Two Next.js replicas behind Nginx. |
| **nginx**      | Front door for the UI on host **80**. |

### URLs (defaults)

- **Web UI:** [http://localhost](http://localhost) (port 80)
- **API:** [http://localhost:8080](http://localhost:8080) (e.g. `GET /api/v1/items`)
- **Postgres:** `localhost:5432` (user `kurator`, password `kurator`, database `kurator`)
- **Meilisearch:** [http://localhost:7700](http://localhost:7700)

The browser calls the API directly (`NEXT_PUBLIC_API_URL` defaults to `http://localhost:8080` at **build** time for the web image).

### Useful environment variables

Set these in the shell or a `.env` file next to `docker-compose.yml` before `docker compose up`:

| Variable | Purpose |
|----------|---------|
| `AUTH_JWT_SECRET` | Secret for short-lived 2FA pending JWTs. **Change this in production.** |
| `MEILI_MASTER_KEY` | Meilisearch master key (default `dev_master_key` in compose). |
| `NEXT_PUBLIC_API_URL` | Base URL baked into the Next.js client (default `http://localhost:8080`). |
| `SESSION_MAX_AGE_SECONDS` | Session cookie lifetime for the API (default 30 days). |
| `COOKIE_SECURE` | Set to `true` when the site is served over HTTPS. |

Stop and remove containers (keeps named volumes):

```bash
docker compose down
```

To reset the database volume as well, remove the volume named for this project (inspect with `docker volume ls`) or use `docker compose down -v` (this deletes Postgres and Meilisearch data).

---

## Postgres only (infra compose)

For a standalone Postgres with the same migrations (e.g. local API development):

```bash
docker compose -f infra/docker-compose.yml up -d
```

Uses a separate Compose project name and volume so it does not collide with the main stack by default. If both stacks publish **5432**, run only one or set `POSTGRES_PORT` for the infra file (see `infra/docker-compose.yml`).

---

## Build and run locally (without full Docker UI stack)

### API

Requires Postgres (and Meilisearch if you use search features) reachable from your machine.

```bash
cd api
export DATABASE_URL='postgres://kurator:kurator@localhost:5432/kurator?sslmode=disable'
export MEILISEARCH_HOST='http://localhost:7700'
export MEILISEARCH_API_KEY='dev_master_key'   # match Meilisearch if set
export AUTH_JWT_SECRET='your-local-secret'
./bin/kurator-api   # after building, see below
```

Or run directly with Go:

```bash
cd api
go run ./cmd/api
```

Build binaries with **Make** (from repo root or `api/`):

```bash
make api-build              # native OS/arch -> api/bin/kurator-api
make -C api build-all     # darwin amd64/arm64 + linux amd64/arm64 under api/bin/
```

See `make -C api help` for all API targets.

### Web (Next.js)

```bash
cd web
npm ci
export NEXT_PUBLIC_API_URL='http://localhost:8080'   # must match where the API is reachable from the browser
npm run dev        # http://localhost:3000
# or production build:
npm run build && npm start
```

Ensure `CORS_ORIGINS` on the API includes your UI origin (e.g. `http://localhost:3000`) if it differs from the Docker defaults.

---

## Makefile shortcuts (repo root)

| Command | Description |
|---------|-------------|
| `make help` | Lists API-related shortcuts. |
| `make api-build` | Build API for current platform. |
| `make api-build-macos` | Cross-build for this Mac (Intel or Apple Silicon). |
| `make api-build-linux` | Linux `amd64` and `arm64` binaries. |
| `make api-build-all` | All four cross-compiled API binaries. |
| `make api-test` | `go test ./...` in `api/`. |
| `make api-clean` | Remove `api/bin/`. |

---

## First-time auth

Register a user from the UI (**Register**) or call `POST /api/v1/auth/register`. Sessions use an HTTP-only cookie scoped to the API origin (`http://localhost:8080` in the default Docker layout).

---

## Project layout

- `api/` — Go API (`cmd/api`), migrations, `Makefile`
- `web/` — Next.js 15 app
- `infra/` — Nginx config, optional `infra/docker-compose.yml` for Postgres alone
- `docker-compose.yml` — full application stack
