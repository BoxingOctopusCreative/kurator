ALTER TABLE wishlists
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_wishlists_user_public ON wishlists (user_id, is_public);
