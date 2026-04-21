-- Optional cover image URL (http(s) or same-origin path after upload) for shelves, lists, and wishlists.
ALTER TABLE collections
    ADD COLUMN IF NOT EXISTS cover_art_url TEXT;

ALTER TABLE lists
    ADD COLUMN IF NOT EXISTS cover_art_url TEXT;

ALTER TABLE wishlists
    ADD COLUMN IF NOT EXISTS cover_art_url TEXT;
