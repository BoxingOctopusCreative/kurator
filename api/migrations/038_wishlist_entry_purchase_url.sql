ALTER TABLE wishlist_entries
    ADD COLUMN IF NOT EXISTS purchase_url TEXT;

COMMENT ON COLUMN wishlist_entries.purchase_url IS 'Optional http(s) link where the item can be purchased (e.g. Amazon, eBay).';
