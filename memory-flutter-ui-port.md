# Porting Kurator web UI to Flutter — agent memory

Use this document when implementing a **Flutter** client that should **match the current Next.js app** in layout, visual language, and behavior (especially **Unsplash-backed marketing/auth** and **in-app page heroes**).

## Scope and source of truth

- **Web implementation**: `web/` (Next.js App Router, React 19, Tailwind CSS v4).
- **Design tokens**: `web/app/globals.css`, `web/app/color-schemes.css`.
- **App chrome** (logged-in shell): `web/components/AppChrome.tsx`, wrapped by `web/components/AppShell.tsx`.
- **Marketing / auth full-bleed background**: `web/components/UnsplashMarketingShell.tsx`.
- **Logged-in page title heroes**: `web/components/PageHeroUnsplash.tsx`.

Treat the web app as the visual spec; mirror spacing, typography roles, and layering—not only hex colors.

---

## Theme: light/dark, palettes, semantic colors

- **Light/dark** is toggled with a root `.dark` class on `html` (Flutter: `ThemeMode` + `Brightness`).
- **Palettes** are `html[data-palette="…"]` with values such as `default`, `darcula`, `catppuccin`, `solarized`, `outrun`, and more defined in `web/app/color-schemes.css`.
- **Semantic tokens** (map to Flutter `ColorScheme` extensions or a `KuratorColors` class):
  - `--kurator-bg` — base canvas / photo tint base
  - `--kurator-main` — main content area (often slightly different from bg)
  - `--kurator-surface` — sidebar, elevated chrome
  - `--kurator-border`, `--kurator-accent`, `--kurator-muted`, `--kurator-fg`, `--kurator-on-accent`

Default light example: bg `#e8edf5`, main `#f6f9fd`, surface `#e7eef9`, border `#d0dbeb`, accent `#5168cf`, muted `#5c6d86`, fg `#1c2738`, onAccent `#ffffff`. Default dark shifts accent toward `#3d9cf0` with deep navy surfaces.

**Elevation** (see `globals.css` `html` / `html.dark`):

- `--kurator-elevation-surface` — cards, tiles, standalone forms (`shadow-surface` in web).
- **Hero bottom**: `shadow-hero-bottom` — subtle shadow under full-width heroes.
- **Floating panels** (menus, modals): `shadow-dropdown` — layered shadows; **no full-page scrim** on modals (transparent hit target + strong panel shadow).

---

## Typography

- **Body / UI**: Futura PT (`futura-pt`) with Cabin fallback; loaded via `next/font` in `web/app/layout.tsx` (see `layout.tsx` for exact `next/font/google` and Adobe kit references).
- **Default headings / page hero H1**: Futura PT Condensed, weight 800, **uppercase**, letter-spacing ~0.02em — see `[data-kurator-page-hero]` rules in `globals.css`.
- **Shelf titles, item titles, profile section headings**: `futura-pt-bold` at 700, **mixed case** for item titles (`.kurator-item-title` overrides hero all-caps).
- **Panel titles** (modals, slide-overs): Futura PT 600 at `text-3xl` scale (`.kurator-panel-title`).
- **User font preference**: `html[data-font="…"]` switches body stack (`default`, `sans`, `serif`, `mono`, accessibility fonts). Flutter should expose the same conceptual options if parity matters.

If licensed webfonts are unavailable on mobile, document a **fallback stack** that preserves hierarchy (condensed bold caps for heroes, geometric sans for body).

---

## Layout: logged-out vs logged-in

### Logged-out (`AppShell` when `user == null`)

- Children sit in `@container min-h-dvh w-full bg-kurator-bg` — full viewport, **no sidebar**.
- Routes: landing, `/login`, `/register`, `/forgot-password`, etc.

### Logged-in

- **`AppChrome`**: `flex min-h-dvh flex-col md:flex-row`.
- **Desktop**: sticky left **sidebar** (`aside`), `bg-kurator-surface`, `border-r`, width **collapsed ~4.75rem** (`md:w-19`) vs **expanded ~14rem** (`md:w-56`), animated width ~200ms.
- **Logo**: collapsed uses small mark assets; expanded uses wide logo URL with `invert` in light mode only (`Logo-Black-Wide-Transparent.png`).
- **Main column**: `@container` wrapper so heroes can **break out to full column width** using container-query width tricks (see `PageHeroUnsplash` `mainColumnBreakout` class string).
- **Mobile**: bottom/top nav patterns as implemented in `AppChrome`.

Flutter: prefer `NavigationRail` + `NavigationDrawer` or a custom rail that matches widths; use `LayoutBuilder` / `constraints` for hero breakout parity.

---

## Unsplash: three separate product behaviors

**Never ship the Unsplash Access Key in a Flutter client.** Reuse the same **server-mediated** contracts as Next (Go API or BFF) or duplicate the Next route behavior behind your API.

### 1) Marketing / auth background (`UnsplashMarketingShell`)

**Purpose**: full-viewport background behind login, register, forgot-password, landing, and some error states.

**Data shape** (`web/lib/unsplash-background.types.ts`):

```ts
{ url, photographer, photographerUrl?, photoPageUrl?, query? }
```

**Loading strategy** (mirror in Flutter):

1. Prefer **SSR/initial payload** when available (Next: `fetchUnsplashBackground()` in `page.tsx` for login/register/etc.).
2. Else read **short TTL cache** + **last-success** persistence (`web/lib/unsplash-background-cache.ts` — keys `kurator-unsplash-bg-v1`, `kurator-unsplash-bg-last-v1`).
3. Else `GET` same-origin **`/api/unsplash-background`** (Next route uses `web/lib/unsplash-background.server.ts`).

**Upstream logic** (for API parity): random **landscape**, `content_filter: high`, tries shuffled **curated search queries** (`SEARCH_TERMS` in `unsplash-background.server.ts`), then falls back to `/photos/random` with a random query.

**Visual stack** (bottom → top):

1. Full-bleed **image** — `BoxFit.cover`, centered; web uses slight **scale(1.03)** to avoid edge seams (`transform` on image).
2. Solid **`kurator-bg` @ 45% opacity** + ~1px **backdrop blur** (very subtle).
3. Second layer: **`kurator-bg` @ 70% opacity** with **vertical gradient mask** (transparent top → opaque bottom) so the image reads at the top and copy sits on a calmer field toward the bottom. On Flutter: `ShaderMask`, `LinearGradient`, or a `Stack` with `Opacity` + gradient mask equivalent.

**Footer attribution** (unless overridden): small **11px** muted text, safe-area bottom padding `max(1.25rem, safeInsets.bottom)`, links for Photo, photographer, and `https://unsplash.com/?utm_source=kurator&utm_medium=referral`.

### 2) In-app page heroes (`PageHeroUnsplash`)

**Purpose**: full **main-column width** banner under page titles on dashboard, lists, collections, item detail, settings, etc.

- Fetches **`/api/unsplash-page-banner?path=…`** with **per-route cache** (~1 hour) via `web/lib/unsplash-page-hero-cache.ts` and `web/lib/unsplash-page-banner.server.ts` (curated terms in `web/lib/unsplash-page-banner-terms.ts`).
- Supports **`customBackgroundUrl`** (shelf/item cover): then skips Unsplash and uses cover image with similar **black/45** + **kurator-bg/70** tint stack (slightly different from marketing shell—hero uses `bg-black/45` on first tint).
- **Hitlists**: optional **`collageCoverUrls`**—when non-empty, entry covers **replace** the custom/Unsplash banner. **≤6** unique covers: horizontal **strip** (one tile per cover). **7+**: **6×4 grid** mosaic (URLs cycle to fill cells). Same tint stack as other heroes (`PageHeroUnsplash`, `web/lib/hitlistHeroCollage.ts`).
- **Negative top margin** “bleed” cancels main column top padding so the image meets the scroll top (`bleedToMainTop`).
- **Typography**: children live in `[data-kurator-page-hero]` — hero **H1** uses condensed uppercase styling from `globals.css`.
- **Attribution** line at bottom of hero (same pattern as marketing, 11px muted).

### 3) Cover art picker (`CoverArtField`)

- Proxied search: **`/api/unsplash-cover-search`**, download trigger: **`POST /api/unsplash-download`** (Unsplash download endpoint for compliance).

---

## Brand assets (URLs)

- **Wide logo (marketing / login)**: `https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png` — use **drop shadow** for contrast on busy photos (web utility `kurator-logo-shadow` in `globals.css`: stacked `drop-shadow` filters).
- **Sidebar marks**: defined as constants in `AppChrome.tsx` (`SIDEBAR_MARK_LIGHT`, `SIDEBAR_MARK_DARK`).
- **404 fallback** example image: see `web/app/not-found.tsx`.

---

## Auth-adjacent UI on login screen

- **`AuthBetaGate`** wraps the form when beta enrollment is enabled.
- **`LoginClient`**: password / Turnstile — mirror API contracts (`web/app/login/LoginClient.tsx`), not visual details here.
- **`Copyright`** component rendered below the fold inside the shell on login.

---

## API auth (direct to Go / Flutter)

- **Spec**: **`api/docs/swagger.json`** — `securityDefinitions` **`SessionCookie`** and **`BearerToken`**; response models **`RegisterResponse`**, **`LoginResponse`**, **`Login2FAResponse`**; **`tags`** entry **auth** summarizes the flow.
- **Implementation**: `api/internal/middleware/session_token.go` (**`SessionRawFromRequest`**), **`RequireAuth`** and **`OptionalAuth`** in `auth.go`, and handlers that need an optional viewer session (collections, items, lists, wishlists, social, **`/api/v2/hitlists` GETs**) use the same helper.
- Successful **`POST /api/v1/auth/register`**, **`POST /api/v1/auth/login`** (when `two_factor_required` is false), and **`POST /api/v1/auth/login/2fa`** return **`session_token`** in JSON — the same opaque secret as the **`kurator_session`** cookie body.
- **Authenticated requests**: **`Authorization: Bearer <session_token>`**. If both cookie and Bearer are present, the **cookie is used** (web proxy behavior).
- **`POST /api/v1/auth/logout`** revokes the session for either mechanism; responses still clear **`Set-Cookie`** when applicable.
- **CORS**: `Authorization` is allowed on configured API origins; native apps are not CORS-limited.
- **Private beta**: unlock still uses **`kurator_beta_unlock`** cookie flows in the web app; mobile in a gated beta may need a WebView or a future API-facing beta proof unless you add one.

---

## Networking and images (Flutter notes)

- **Image URL safety**: web sanitizes with `web/lib/safeUrl.ts` (`safeImageSrcUrl`, `safeHttpUrl`) before rendering—replicate allowlisting for `http`/`https` and trusted hosts if you accept arbitrary URLs.
- **Unsplash image host**: `images.unsplash.com` is allowlisted in `web/next.config.ts` for `next/image`; Flutter `Image.network` needs equivalent caching and error fallbacks.
- **Preconnect** (web `layout.tsx`): `images.unsplash.com`, `api.unsplash.com` — optional in Flutter via HTTP client configuration / warm-up.

---

## Copy and interaction conventions

- **Title Case** for page titles and nav labels (short words like *to*, *with*, *and* lowercase when not first word) — see root `memory.md` UI conventions.
- Prefer **borderless icon actions** unless a border is needed for a11y.
- **Safe areas**: marketing shell footer and mobile chrome respect `env(safe-area-inset-bottom)` — use `SafeArea` / padding in Flutter.

---

## Suggested Flutter module map

| Web concept | Flutter direction |
|-------------|-------------------|
| `color-schemes.css` + `globals.css` | `ThemeData` + `ThemeExtension<KuratorColors>` + dark palette variants |
| `UnsplashMarketingShell` | `Scaffold` + `Stack`: `DecorationImage` / `Image` + gradient masks + tint `ColorFiltered` or layered `Container` |
| `PageHeroUnsplash` | Reusable `SliverAppBar` / custom `PageHeader` with breakout width tied to parent constraints |
| `AppChrome` | `NavigationRail` + `Scaffold` body + mobile `NavigationBar` |
| Unsplash caches | `shared_preferences` or local DB; honor TTL and last-good fallback |
| API routes | Call your **backend** endpoints that mirror `/api/unsplash-*` behavior; do not embed secrets |
| Kurator REST **`/api/v1`** | Base URL = public API host; **`session_token`** + **`Authorization: Bearer`** for authenticated calls; see **`api/docs/swagger.json`** |

---

## Verification checklist (Flutter)

1. Login/register: full-bleed Unsplash background, gradient/tint reads like web, logo shadow visible, attribution footer with UTM link.
2. Theme: default palette light/dark matches hex tokens; switching palette updates all semantic roles.
3. Logged-in home: hero spans main column width; title uppercase condensed; attribution when Unsplash hero loads.
4. Shelf with custom cover: hero shows cover, not Unsplash.
5. Modals: strong dropdown shadow, no dimmed full-screen scrim (unless you intentionally differ—then document).
6. Auth: login → store **`session_token`** → authenticated **`/api/v1/*`** requests send **`Authorization: Bearer`**; logout clears server session.

When in doubt, open the referenced `web/` files and match **computed structure** (Stack order, opacities, font roles) before tuning pixel-perfect values.
