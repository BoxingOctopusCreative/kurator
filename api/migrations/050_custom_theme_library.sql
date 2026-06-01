-- Theme library (own drafts + marketplace installs) and active selection for Pro users.

CREATE TABLE IF NOT EXISTS user_custom_theme_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('own', 'marketplace')),
    ref_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    s3_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, source, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_user_custom_theme_library_user
    ON user_custom_theme_library (user_id, created_at DESC);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS active_custom_theme_library_id UUID
        REFERENCES user_custom_theme_library (id) ON DELETE SET NULL;
