-- Lists: curated groups of existing items (multi-category). Collection shelves: optional single category.

ALTER TABLE collections
    ADD COLUMN category TEXT;

ALTER TABLE collections
    ADD CONSTRAINT collections_category_check CHECK (
        category IS NULL
        OR category IN (
            'game',
            'music',
            'book',
            'movies',
            'tv',
            'anime',
            'comic_book',
            'manga'
        )
    );

-- Lock each shelf to the dominant item category where items exist.
WITH counts AS (
    SELECT
        collection_id,
        category::text AS cat,
        COUNT(*)::bigint AS cnt
    FROM items
    GROUP BY
        collection_id,
        category
),
ranked AS (
    SELECT
        collection_id,
        cat,
        ROW_NUMBER() OVER (
            PARTITION BY collection_id
            ORDER BY
                cnt DESC,
                cat
        ) AS rn
    FROM counts
)
UPDATE collections c
SET category = r.cat
FROM ranked r
WHERE
    c.id = r.collection_id
    AND r.rn = 1;

CREATE TABLE lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lists_user_id ON lists (user_id);

CREATE TABLE list_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT list_entries_list_item_unique UNIQUE (list_id, item_id)
);

CREATE INDEX idx_list_entries_list_id ON list_entries (list_id);

CREATE INDEX idx_list_entries_item_id ON list_entries (item_id);
