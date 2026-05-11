# Kurator Project Memory

## Overview
Kurator is a comprehensive collection tracker application that allows users to catalog and organize various media collections including games, music, books, movies, TV shows, anime, comics, and manga. It features a full-stack architecture with a Go API backend and Next.js frontend.

## Architecture
- **Backend**: Go API built with Fiber framework (v2.52.12)
- **Frontend**: Next.js 15 with React 19, TypeScript, and Tailwind CSS
- **Database**: PostgreSQL
- **Search**: Meilisearch for fast text search
- **Reverse Proxy**: Traefik (load-balanced with SSL termination)
- **Deployment**: Docker containers with docker-compose orchestration

## Project Structure
```
kurator/
├── api/                    # Go backend API
│   ├── cmd/api/           # API entry point
│   ├── internal/          # Internal packages
│   │   ├── config/        # Configuration management
│   │   ├── handler/       # HTTP request handlers
│   │   ├── middleware/    # HTTP middleware
│   │   ├── models/        # Data models
│   │   ├── repository/    # Database access layer
│   │   └── service/       # Business logic
│   ├── migrations/        # Database migrations
│   └── Dockerfile
├── web/                   # Next.js frontend
│   ├── app/              # App router pages
│   ├── components/       # React components
│   ├── lib/              # Utility functions
│   └── Dockerfile
├── infra/                 # Infrastructure configurations
│   └── docker-compose.yml # PostgreSQL-only setup
├── docker-compose.yml    # Full stack setup
└── Makefile             # Build and development shortcuts
```

## Key Features
- **Multi-category Collection Tracking**: Games, music, books, movies, TV, anime, comics, manga
- **Authentication & Authorization**: JWT-based auth with 2FA support
- **Search & Discovery**: Meilisearch-powered search
- **Public & Private Collections**: User-controlled visibility settings
- **Social Features**: Follow users, view public profiles
- **Barcode Scanning**: HTML5-based QR/barcode scanning
- **External Metadata Integration**: TMDB, Discogs, TheGamesDB, Google Books, ComicVine
- **Image Storage**: S3-compatible storage for covers and avatars
- **Beta Access System**: Key-based beta access control

## API Endpoints
- Authentication: `/api/v1/auth/*` (login, register, 2FA)
- Users: `/api/v1/users/*` (profiles, settings)
- Collections: `/api/v1/collections/*` (CRUD operations)
- Items: `/api/v1/items/*` (CRUD operations)
- Lists & Wishlists: `/api/v1/lists/*`, `/api/v1/wishlists/*`
- Search: `/api/v1/search/*`
- Social: `/api/v1/follows/*`

## Data Models

### Item Model
- Categories: game, music, book, movies, tv, anime, comic_book, manga
- Consumption status: pending, done
- Rating system: 1-5 stars
- Metadata: Category-specific JSON data

### User Model
- Authentication via email/password
- Profile information: username, display name, bio, location
- Social links (JSON)
- Privacy controls for profile visibility
- 2FA support with TOTP

### Collection Model
- Name and description
- Optional category pinning
- Cover art support
- Public/private visibility toggle
- Item count tracking

## Development Workflow

### API Development
```bash
cd api
go run ./cmd/api  # Run directly
make build       # Build binary
```

### Web Development
```bash
cd web
npm run dev      # Development server
npm run build    # Production build
```

### Full Stack (Docker)
```bash
docker compose up --build -d  # Full stack
```

## Database Schema
- Tables: users, collections, items, wishlists, lists, follows, beta_keys
- Migrations: Located in `api/migrations/`
- Foreign key relationships maintain data integrity

## Security Considerations
- JWT-based authentication with secure cookies
- Password hashing with bcrypt
- 2FA support using TOTP
- CORS restrictions
- SQL injection prevention (parameterized queries)
- Input validation
- Rate limiting on sensitive endpoints
- Cloudflare Turnstile integration for bot protection

## Deployment Architecture
- API service (Go) on port 8080
- Web service (Next.js) on port 3000 (load-balanced by Traefik)
- Meilisearch on port 7700
- PostgreSQL on port 5432
- Traefik as reverse proxy with SSL termination and routing
- External domains: kuratorapp.cc, api.kuratorapp.cc, swagger.kuratorapp.cc
- Static assets hosted on assets.kuratorapp.cc and userassets.kuratorapp.cc

## Monitoring and Error Handling
- Sentry integration for error tracking
- Health checks for all services
- Logging throughout the application
- Graceful error handling in API responses

## UI design

- Prefer **borderless icon actions** (icon + hover/focus surface) over **bordered icon buttons** except where a border is required for accessibility or very strong affordance (e.g. destructive emphasis may use color/background only, not a heavy chrome border).
- **Modals and dialog overlays** must **not** darken or dim the full page behind them (`bg-black/*` scrims are not used). Use a **transparent** full-screen capture layer for outside-click dismiss and stack **drop shadows** on the panel (`shadow-dropdown` / layered shadows in `globals.css`) so the modal reads as a floating card above the page.

## UI Copy
- Page titles (`metadata.title`, document title template segments) and navigation/menu link text use **Title Case** (capitalize principal words; short prepositions/conjunctions like *to*, *with*, *and* stay lowercase when not the first word—e.g. “Back to Dashboard”, “Confirm with Authenticator”, “Log In”, “Forgot Password?”).

## Privacy policy

- **`web/content/privacy-policy.md`** is the source copy for `/privacy`, rendered via ReactMarkdown and Tailwind Typography; production optionally loads from S3 (see `web/lib/privacyPolicyMarkdown.ts`).
- **Whenever you change behaviour that affects privacy or data collection** (new integrations, telemetry, cookies, stored fields, third-party flows, etc.), update this markdown in the **same plain-language style** already used there: factual and clear for readers, avoiding implementation detail (specific vendors, SDK options, env var names in user-facing prose) unless the team explicitly wants that surfaced.

## Development Notes
- API uses clean architecture with handlers, services, and repositories
- Next.js uses App Router with server components where appropriate
- Image optimization disabled for remote images to serve them directly
- Authentication uses HTTP-only cookies for sessions
- The application supports both local development and containerized deployment