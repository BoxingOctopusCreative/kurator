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
| **Browser → API** | Same-origin **`/api/v1/*`** and **`/api/v2/*`** proxied by Next (`web/app/api/v1/[[...path]]/route.ts`, `web/app/api/v2/[[...path]]/route.ts`) so session cookies stay on the web origin; server code uses `API_INTERNAL_URL` / `NEXT_PUBLIC_API_URL` (`web/lib/apiUrl.ts`; use `{ version: "v2" }` or `/api/v2/...` for hitlists) |
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
│   ├── app/              # App Router, API proxy routes (`api/v1`, `api/v2`)
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
- **Passkeys (WebAuthn)**: Enabled when **`PUBLIC_WEB_BASE_URL`** (or first CORS origin) defines the RP ID/origin (e.g. `http://localhost:3000` → RP ID **`localhost`** — use that host in the browser, not `127.0.0.1`). **Registration** while signed in: **`POST /me/webauthn/register/begin|finish`**; **login**: **`POST /auth/webauthn/login/begin|finish`** (optional **`email`** scopes credentials; omit for discoverable/passkey autofill). Sets the same **`kurator_session`** / **`session_token`** as password login; **skips TOTP** when 2FA is on. Cannot remove the last passkey unless the account still has a **password** or **linked OAuth**. Web: **App Settings → Passkeys**, **Log in → Sign in with passkey**. Migration **`046_webauthn_credentials.sql`**. Library: **go-webauthn** + **`@simplewebauthn/browser`**.
- **OAuth (Google, Discord)**: Optional when **`GOOGLE_OAUTH_*`** / **`DISCORD_OAUTH_*`** are set. Browser flow: **`GET /api/v1/auth/oauth/{provider}?next=/path`** → provider → **`GET /api/v1/auth/oauth/{provider}/callback`** (same-origin via Next proxy) sets **`kurator_session`** and redirects to **`next`**. **Outside private beta**: unknown provider accounts are **registered** ( **`oauth_identities`** + user row, **`password_hash`** NULL) and **provisioned** with a starter collection (**`My Collection`**, games category) via **`OnAccountCreated`**. **Private beta (`BETA_ACCESS_REQUIRED`)**: OAuth is **login-only** for accounts already linked; new sign-ups must use the email invite + **`POST /auth/register`**. **Linking existing password accounts**: signed-in **`GET /api/v1/me/oauth/{provider}/link`** (state `mode=link`); callback requires matching session; provider email may differ from the Kurator account email (identity is **`provider` + `provider_user_id`**); **`GET /api/v1/me/oauth/identities`**, **`DELETE /api/v1/me/oauth/{provider}`** (cannot remove last auth method without a password). Web: **App Settings → Sign-In Methods**. **Downstream mobile**: use system browser / ASWebAuthenticationSession to the start URL; session still cookie-based on web—native should continue **Bearer** from password login unless you add a token handoff.
- **Bearer**: Protected routes accept **`Authorization: Bearer <session_token>`** with the same semantics as the cookie. Resolution order: **cookie first**, then Bearer (`SessionRawFromRequest` in `api/internal/middleware/`).
- **JWT**: Short-lived tokens for **pending 2FA** after password step; **`kurator_beta_unlock`** cookie when `BETA_ACCESS_REQUIRED` is on (set after the user opens an approved **email invite** link, consumed at register). No shared beta keys. Plan separately if mobile must complete gated beta without a WebView.
- Passwords: bcrypt; optional **TOTP** 2FA.
- **Turnstile** on sensitive auth routes when enabled.
- **CORS**: `Authorization` is an allowed header when the browser calls the API origin directly (`api/cmd/api/main.go`); same-origin web traffic still prefers the Next proxy.
- Parameterized SQL, validation package, rate limits where configured.

## Major API surface (prefix `/api/v1`)

Auth (`/auth/*`, login/register/logout/2FA, password recovery, beta flows), **`/me`**, collections, items, lists, wishlists, search, metadata lookup, images, notifications, follows / social. Full contract and **`SessionCookie` / `BearerToken`** security: **`api/docs/swagger.json`**.

## API v2 Hitlists (implemented in API)

- **Base path**: **`/api/v2/hitlists`** (see **`api/docs/swagger.json`** tag `hitlists-v2`). **v1 `/lists`** remains unchanged; shared storage is table **`lists`** (not renamed). **Discover** (no `owner_user_id`): optional auth; returns non-private lists visible to the viewer with **`sort=recent|liked|active|hottest`**. **`view_count`** on lists (migration **`042`**) increments on v2 hitlist GET by id or slug (approximate traffic).
- **Visibility**: model + DB add **`public`** (internet). **Collections** and **wishlists** constraints allow `public` too; **unauthenticated read**: collection GET (legacy + user-owned **`public`** rows), wishlist GET + list entries GET (**`public`** only); hitlist v2 GETs use optional auth for all visibility rules.
- **Migration `039`**: `lists.slug` (unique), `lists.comments_enabled`; `list_entries` nullable `item_id` + stub columns; `hitlist_votes`, `hitlist_comments`. **`041`** adds **`lists.entries_numbered`** (default true): owners can choose ordered (numbered) vs unordered hitlist presentation. **`043`** adds **`list_entries.sort_order`** (backfilled to preserve former newest-first ordering); **`PUT /api/v2/hitlists/:id/entries/order`** with **`entry_ids`** (full permutation) updates order for owners / shared editors.
- **Entry row description**: **`PATCH /api/v2/hitlists/:id/entries/:entryId`** with **`{ "description": "<markdown or empty>" }`** updates **`list_entries.description`** (curator blurb for that row only; does not change the linked shelf item). Web: **`patchHitlistEntryDescription`** + **`HitlistEntryListNoteEditor`** for rows whose linked **`item`** has a **`collection_id`** (shelf-sourced), when the viewer may edit the hitlist; loose items use the item’s own description fields.
- **Slug suggestions**: `POST /api/v2/hitlists/slug-suggestions` (auth). Collision suffix per **`memory.md`** (alphanumeric from Base64 of last three runes + optional CSPRNG tail).
- Discover **`GET /api/v2/hitlists`** includes **`viewer_has_voted`** when the caller is signed in (for feed voting UI); **`ListsBrowser`** renders **`HitlistVoteColumn`** per row (same up/down chevrons as list detail). **Web (lists UI)**: **`web/lib/api.ts`** routes list CRUD through **v2 `/hitlists`** (entries, votes, comments); nav copy uses **Hitlists**; **`/hitlists/[slug]`** is the public permalink page; descriptions and comments use **Markdown** (`MarkdownBody` + `react-markdown`) and **Tiptap** (`MarkdownRichEditor`) for authoring. Hitlist rows use **`HitlistEntryRow`** inside **`HitlistEntriesSortableList`** (drag handle + **@dnd-kit** when **`may_edit_entries`**) in **`ListDetailClient`** and **`HitlistSlugClient`** — **numbered vs unordered** is per list (`entries_numbered` on **`GET/PUT` hitlist**); when off, ranks are hidden and the list renders as unordered. **`GET /api/v1/items/:id/lists`** returns **`ListRef`** with **`slug`** + **`visibility`**; browsing surfaces use **`hitlistBrowsePath`**: **signed-out** viewers get **`/hitlists/:slug`** when **public + slug**; **signed-in** callers pass **`preferAppView`** so links default to **`/lists/:id`**. Visiting **`/hitlists/:slug`** while signed in **redirects** to **`/lists/:id`**; list detail still exposes the permalink for sharing. Signed-in viewers get **Add this to my account** (modal → choose **collection** or **wishlist**, then `POST /items` or `POST /wishlists/:id/entries` with copied title/category/metadata from the entry’s item or stub; see `HitlistAddToAccountButton`, `hitlistEntryCopy`). Profile **`owner_user_id`** queries use v2 for lists. **Downstream mobile**: mirror **`entries_numbered`** on list models and entry list UI; persist **`sort_order`** + reorder API; prefer permalink path for public lists when **`slug`** is present. **Still open** (optional): share on collections/wishlists, profile-wide public opt-in UX polish.

## API v2 and public Hitlists (product notes)

- **Browser / Next proxy**: Mirror v1’s pattern with **`/api/v2/*`** on the web app (same-origin cookie proxy); document **`API_INTERNAL_URL`** for server-side v2 calls.
- **Hitlist votes and comments**: **No anonymous participation** — casting a vote and posting a comment **always** require an **authenticated session** (cookie or Bearer). There is no guest, pseudo-anonymous, or optional-auth path for these actions.
- **Hitlist vote control (web)**: Reddit-style column (up / score / down); up toggles upvote; down removes your upvote only (no negative scores / downvotes in API). **`POST` / `DELETE`** **`/api/v2/hitlists/:id/votes`** return **`{ vote_count, viewer_has_voted }`** so clients match server counts (idempotent upvote does not inflate totals). Discover feed computes **`viewer_has_voted`** with a **`LEFT JOIN hitlist_votes`** + **`BOOL_OR`** grouped with list rows so it stays consistent with detail **`VoteStats`**.

## Data model notes

- **Item categories** include: `game`, `music`, `book`, `movies`, `tv`, `anime`, `comic_book`, `manga` (see code and migrations for canonical enums).
- **Standalone (“loose”) items** (migration **`040`**): not on any shelf — **`items.collection_id`** NULL, **`items.owner_user_id`** set; shelved rows keep **`owner_user_id`** NULL. **`POST /v1/items`** with JSON **`collection_id: null`** or **`standalone_item: true`** creates a loose item (omit **`collection_id`** without **`standalone_item`** still means “default shelf” when resolvable — web **`createItem`** sends both for standalone). Loose items are visible on **`GET /items/:id`** to the owner, or via list membership (e.g. a hitlist the viewer can read). **Downstream mobile**: mirror optional **`collection_id`**, optional **`owner_user_id`**, **`standalone_item`**, and create semantics.
- **Consumption**: `pending` | `done` with category-specific UI labels in `web/lib/consumptionLabels.ts`.
- **Collections**: visibility, optional pinned category, cover art. Main **`/collections`** list: **Create Your Own!** sits in the filter bar (opposite All/Following + search/sort filters) and opens **`CollectionCreateModal`**; unauthenticated click sends **`/login?next=/collections`**.
- **Wishlist entries**: optional **`purchase_url`** (http/https only) for a store listing (Amazon, eBay, etc.); works on all existing entries after migration `038` (nullable column). **PATCH** `/wishlists/:id/entries/:entryId` updates only `purchase_url` without resubmitting metadata. Wishlist JSON includes **`may_edit_entries`** for owners and shared collaborators (any visibility, including private — not tied to internet-public). **`HitlistAddToAccountButton`** (“Add this to my account”) lists wishlists via **`wishlistMayReceiveItems`** / **`GET /wishlists`**. Main **`/wishlists`** list: toolbar card below the hero (aligned with **`/collections`**) with **Create Your Own!** → **`WishlistCreateModal`**; unauthenticated click sends **`/login?next=/wishlists`**.

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
