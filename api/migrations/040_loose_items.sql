-- Standalone ("loose") items: not on any shelf, owned by a user via owner_user_id.
-- Shelved rows: collection_id NOT NULL, owner_user_id NULL.
-- Loose rows: collection_id NULL, owner_user_id NOT NULL.

BEGIN;

ALTER TABLE items ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE items ALTER COLUMN collection_id DROP NOT NULL;

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_shelf_or_loose_check;
ALTER TABLE items ADD CONSTRAINT items_shelf_or_loose_check CHECK (
    (collection_id IS NOT NULL AND owner_user_id IS NULL)
    OR (collection_id IS NULL AND owner_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_items_owner_loose ON items (owner_user_id) WHERE collection_id IS NULL;

COMMIT;
