-- Internet-public visibility, hitlist slugs, entry stubs, votes, comments.

ALTER TABLE collections
    DROP CONSTRAINT IF EXISTS collections_visibility_check;

ALTER TABLE collections
    ADD CONSTRAINT collections_visibility_check
        CHECK (visibility IN ('private', 'followers', 'friends', 'public'));

ALTER TABLE lists
    DROP CONSTRAINT IF EXISTS lists_visibility_check;

ALTER TABLE lists
    ADD CONSTRAINT lists_visibility_check
        CHECK (visibility IN ('private', 'followers', 'friends', 'public'));

ALTER TABLE wishlists
    DROP CONSTRAINT IF EXISTS wishlists_visibility_check;

ALTER TABLE wishlists
    ADD CONSTRAINT wishlists_visibility_check
        CHECK (visibility IN ('private', 'followers', 'friends', 'public'));

ALTER TABLE lists
    ADD COLUMN IF NOT EXISTS slug TEXT;

ALTER TABLE lists
    ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lists_slug_unique ON lists (slug)
WHERE slug IS NOT NULL AND length(trim(slug)) > 0;

ALTER TABLE list_entries
    DROP CONSTRAINT IF EXISTS list_entries_list_item_unique;

ALTER TABLE list_entries
    ALTER COLUMN item_id DROP NOT NULL;

ALTER TABLE list_entries
    ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE list_entries
    ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE list_entries
    ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE list_entries
    ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE list_entries
    ADD CONSTRAINT list_entries_category_stub_check CHECK (
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

ALTER TABLE list_entries
    ADD CONSTRAINT list_entries_kind_check CHECK (
        (
            item_id IS NOT NULL
            AND title IS NULL
            AND category IS NULL
            AND metadata IS NULL
        )
        OR (
            item_id IS NULL
            AND title IS NOT NULL
            AND category IS NOT NULL
            AND metadata IS NOT NULL
        )
    );

CREATE UNIQUE INDEX list_entries_list_item_unique ON list_entries (list_id, item_id)
WHERE item_id IS NOT NULL;

CREATE TABLE hitlist_votes (
    list_id UUID NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (list_id, user_id)
);

CREATE INDEX idx_hitlist_votes_list_id ON hitlist_votes (list_id);

CREATE TABLE hitlist_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    list_id UUID NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hitlist_comments_list_id_created ON hitlist_comments (list_id, created_at DESC);
