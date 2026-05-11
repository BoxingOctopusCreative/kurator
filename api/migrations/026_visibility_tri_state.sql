-- Add tri-state visibility (private | followers | friends) to user-owned shelves.
-- Backfill from the legacy is_public boolean and keep it in sync via a generated column
-- so existing read paths continue to work during rollout.

ALTER TABLE collections
    ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'followers';

ALTER TABLE lists
    ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'followers';

ALTER TABLE wishlists
    ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'followers';

UPDATE collections
SET visibility = CASE WHEN is_public THEN 'followers' ELSE 'private' END
WHERE visibility = 'followers';

UPDATE lists
SET visibility = CASE WHEN is_public THEN 'followers' ELSE 'private' END
WHERE visibility = 'followers';

UPDATE wishlists
SET visibility = CASE WHEN is_public THEN 'followers' ELSE 'private' END
WHERE visibility = 'followers';

ALTER TABLE collections
    DROP CONSTRAINT IF EXISTS collections_visibility_check;
ALTER TABLE collections
    ADD CONSTRAINT collections_visibility_check
        CHECK (visibility IN ('private', 'followers', 'friends'));

ALTER TABLE lists
    DROP CONSTRAINT IF EXISTS lists_visibility_check;
ALTER TABLE lists
    ADD CONSTRAINT lists_visibility_check
        CHECK (visibility IN ('private', 'followers', 'friends'));

ALTER TABLE wishlists
    DROP CONSTRAINT IF EXISTS wishlists_visibility_check;
ALTER TABLE wishlists
    ADD CONSTRAINT wishlists_visibility_check
        CHECK (visibility IN ('private', 'followers', 'friends'));

CREATE INDEX IF NOT EXISTS idx_collections_user_visibility
    ON collections (user_id, visibility) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lists_user_visibility
    ON lists (user_id, visibility);
CREATE INDEX IF NOT EXISTS idx_wishlists_user_visibility
    ON wishlists (user_id, visibility);
