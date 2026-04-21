-- Switch collections, items, wishlists, and wishlist_entries to UUID primary keys.
-- Existing rows receive stable new UUIDs; foreign keys are rewritten in-place.
-- Requires pgcrypto (already enabled in 001_init.sql) for gen_random_uuid().

BEGIN;

ALTER TABLE collections ADD COLUMN uuid_id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE items ADD COLUMN uuid_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE items ADD COLUMN collection_uuid UUID;
UPDATE items i SET collection_uuid = c.uuid_id FROM collections c WHERE i.collection_id = c.id;
ALTER TABLE items ALTER COLUMN collection_uuid SET NOT NULL;

ALTER TABLE wishlists ADD COLUMN uuid_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE wishlists ADD COLUMN target_collection_uuid UUID;
UPDATE wishlists w SET target_collection_uuid = c.uuid_id FROM collections c
WHERE w.target_collection_id IS NOT NULL AND w.target_collection_id = c.id;

ALTER TABLE wishlist_entries ADD COLUMN uuid_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE wishlist_entries ADD COLUMN wishlist_uuid UUID;
UPDATE wishlist_entries e SET wishlist_uuid = w.uuid_id FROM wishlists w WHERE e.wishlist_id = w.id;
ALTER TABLE wishlist_entries ALTER COLUMN wishlist_uuid SET NOT NULL;

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_collection_id_fkey;
ALTER TABLE wishlists DROP CONSTRAINT IF EXISTS wishlists_target_collection_id_fkey;
ALTER TABLE wishlist_entries DROP CONSTRAINT IF EXISTS wishlist_entries_wishlist_id_fkey;

ALTER TABLE collections DROP CONSTRAINT IF EXISTS collections_pkey;
ALTER TABLE collections DROP COLUMN id;
ALTER TABLE collections RENAME COLUMN uuid_id TO id;
ALTER TABLE collections ADD PRIMARY KEY (id);

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_pkey;
ALTER TABLE items DROP COLUMN id;
ALTER TABLE items DROP COLUMN collection_id;
ALTER TABLE items RENAME COLUMN uuid_id TO id;
ALTER TABLE items RENAME COLUMN collection_uuid TO collection_id;
ALTER TABLE items ADD PRIMARY KEY (id);
ALTER TABLE items ADD CONSTRAINT items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE CASCADE;

ALTER TABLE wishlists DROP CONSTRAINT IF EXISTS wishlists_pkey;
ALTER TABLE wishlists DROP COLUMN id;
ALTER TABLE wishlists DROP COLUMN target_collection_id;
ALTER TABLE wishlists RENAME COLUMN uuid_id TO id;
ALTER TABLE wishlists RENAME COLUMN target_collection_uuid TO target_collection_id;
ALTER TABLE wishlists ADD PRIMARY KEY (id);
ALTER TABLE wishlists ADD CONSTRAINT wishlists_target_collection_id_fkey FOREIGN KEY (target_collection_id) REFERENCES collections (id) ON DELETE SET NULL;

ALTER TABLE wishlist_entries DROP CONSTRAINT IF EXISTS wishlist_entries_pkey;
ALTER TABLE wishlist_entries DROP COLUMN id;
ALTER TABLE wishlist_entries DROP COLUMN wishlist_id;
ALTER TABLE wishlist_entries RENAME COLUMN uuid_id TO id;
ALTER TABLE wishlist_entries RENAME COLUMN wishlist_uuid TO wishlist_id;
ALTER TABLE wishlist_entries ADD PRIMARY KEY (id);
ALTER TABLE wishlist_entries ADD CONSTRAINT wishlist_entries_wishlist_id_fkey FOREIGN KEY (wishlist_id) REFERENCES wishlists (id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_items_collection_id;
CREATE INDEX idx_items_collection_id ON items (collection_id);
DROP INDEX IF EXISTS idx_wishlist_entries_wishlist_id;
CREATE INDEX idx_wishlist_entries_wishlist_id ON wishlist_entries (wishlist_id);

COMMIT;
