-- Replace legacy `video` with `movies`, `tv`, and `anime`. Existing rows are inferred from metadata when possible.
-- Drop CHECK constraints before UPDATE: the old constraint still allows `video` only, not `movies` / `tv`.

BEGIN;

ALTER TABLE items
    DROP CONSTRAINT IF EXISTS items_category_check;

ALTER TABLE collections
    DROP CONSTRAINT IF EXISTS collections_category_check;

ALTER TABLE wishlist_entries
    DROP CONSTRAINT IF EXISTS wishlist_entries_category_check;

UPDATE items
SET category = CASE
    WHEN COALESCE(metadata ->> 'catalog_tmdb_media_type', '') = 'tv' THEN 'tv'
    WHEN LOWER(TRIM(COALESCE(metadata ->> 'video_type', ''))) = 'series' THEN 'tv'
    WHEN LOWER(TRIM(COALESCE(metadata ->> 'video_type', ''))) = 'movie' THEN 'movies'
    ELSE 'movies'
END
WHERE category = 'video';

UPDATE wishlist_entries
SET category = CASE
    WHEN COALESCE(metadata ->> 'catalog_tmdb_media_type', '') = 'tv' THEN 'tv'
    WHEN LOWER(TRIM(COALESCE(metadata ->> 'video_type', ''))) = 'series' THEN 'tv'
    WHEN LOWER(TRIM(COALESCE(metadata ->> 'video_type', ''))) = 'movie' THEN 'movies'
    ELSE 'movies'
END
WHERE category = 'video';

UPDATE collections
SET category = 'movies'
WHERE category = 'video';

ALTER TABLE items
    ADD CONSTRAINT items_category_check CHECK (
        category = ANY (
            ARRAY[
                'game',
                'music',
                'book',
                'movies',
                'tv',
                'anime',
                'comic_book',
                'manga'
            ]::text[]
        )
    );

ALTER TABLE collections
    ADD CONSTRAINT collections_category_check CHECK (
        category IS NULL
        OR category = ANY (
            ARRAY[
                'game',
                'music',
                'book',
                'movies',
                'tv',
                'anime',
                'comic_book',
                'manga'
            ]::text[]
        )
    );

ALTER TABLE wishlist_entries
    ADD CONSTRAINT wishlist_entries_category_check CHECK (
        category = ANY (
            ARRAY[
                'game',
                'music',
                'book',
                'movies',
                'tv',
                'anime',
                'comic_book',
                'manga'
            ]::text[]
        )
    );

COMMIT;
