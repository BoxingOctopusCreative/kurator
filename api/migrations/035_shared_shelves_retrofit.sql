-- Retrofit layer for shared shelves (apply after 034_shared_shelves.sql).
--
-- 034 already makes the feature safe on existing data: is_shared defaults to FALSE on every
-- pre-existing collection, list, and wishlist, so visibility and access rules match legacy
-- behaviour until an owner explicitly enables sharing.
--
-- This migration adds operator-facing comments and partial indexes for common queries
-- (finding user-owned shared shelves). It is idempotent via IF NOT EXISTS.

COMMENT ON COLUMN collections.is_shared IS
    'When true, collaborators listed in shelf_members may see and curate items; others may request to join.';
COMMENT ON COLUMN lists.is_shared IS
    'When true, collaborators in shelf_members may see the list and add or remove item links.';
COMMENT ON COLUMN wishlists.is_shared IS
    'When true, collaborators in shelf_members may see the wishlist and manage entries.';
COMMENT ON TABLE shelf_members IS
    'Users approved to collaborate on a shared shelf (collection, list, or wishlist).';
COMMENT ON TABLE shelf_access_requests IS
    'Pending join_request (viewer asks owner) or invite (owner asks friend); recipient approves or dismisses.';

CREATE INDEX IF NOT EXISTS idx_collections_user_is_shared
    ON collections (user_id)
    WHERE user_id IS NOT NULL AND is_shared = TRUE;

CREATE INDEX IF NOT EXISTS idx_lists_user_is_shared
    ON lists (user_id)
    WHERE is_shared = TRUE;

CREATE INDEX IF NOT EXISTS idx_wishlists_user_is_shared
    ON wishlists (user_id)
    WHERE is_shared = TRUE;
