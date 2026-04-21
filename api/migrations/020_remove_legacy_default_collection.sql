-- Drop the legacy shared "Default" shelf (001_init seed: user_id NULL, name Default).
-- Items in that collection are removed by ON DELETE CASCADE on items.collection_id.
-- Wishlists with target_collection_id pointing here are cleared by ON DELETE SET NULL.
DELETE FROM collections
WHERE user_id IS NULL
  AND LOWER(BTRIM(name)) = 'default';
