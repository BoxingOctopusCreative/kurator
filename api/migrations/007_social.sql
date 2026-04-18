ALTER TABLE collections
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS user_follows (
    follower_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    following_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows (following_id);

CREATE INDEX IF NOT EXISTS idx_collections_user_public ON collections (user_id, is_public)
    WHERE user_id IS NOT NULL;
