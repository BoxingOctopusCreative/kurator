-- Custom Theme YAML (Kurator Pro): user drafts, published repository, moderation.

CREATE TABLE IF NOT EXISTS user_custom_themes (
    user_id BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    theme_id UUID NOT NULL DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    s3_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custom_theme_upload_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_theme_upload_log_user_time
    ON custom_theme_upload_log (user_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS published_custom_themes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    theme_family_id UUID NOT NULL,
    version INT NOT NULL CHECK (version >= 1),
    author_user_id BIGINT REFERENCES users (id) ON DELETE SET NULL,
    author_display_name TEXT NOT NULL,
    author_profile_url TEXT,
    author_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    s3_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (theme_family_id, version)
);

CREATE INDEX IF NOT EXISTS idx_published_custom_themes_name
    ON published_custom_themes (LOWER(name));

CREATE INDEX IF NOT EXISTS idx_published_custom_themes_created
    ON published_custom_themes (created_at DESC);

CREATE TABLE IF NOT EXISTS custom_theme_reports (
    id BIGSERIAL PRIMARY KEY,
    published_theme_id UUID NOT NULL REFERENCES published_custom_themes (id) ON DELETE CASCADE,
    reporter_user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'reviewed', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (published_theme_id, reporter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_theme_reports_status
    ON custom_theme_reports (status, created_at DESC);
