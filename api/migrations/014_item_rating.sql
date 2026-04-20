-- Personal 1–5 star rating per item (NULL = not rated).
ALTER TABLE items
    ADD COLUMN IF NOT EXISTS rating SMALLINT;

ALTER TABLE items
    DROP CONSTRAINT IF EXISTS items_rating_check;

ALTER TABLE items
    ADD CONSTRAINT items_rating_check CHECK (
        rating IS NULL
        OR (
            rating >= 1
            AND rating <= 5
        )
    );
