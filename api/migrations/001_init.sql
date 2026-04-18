CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE collections (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE items (
    id             BIGSERIAL PRIMARY KEY,
    collection_id  BIGINT NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    category       TEXT NOT NULL CHECK (category IN ('game', 'music', 'book', 'video', 'comic_book', 'manga')),
    metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_items_collection_id ON items (collection_id);
CREATE INDEX idx_items_category ON items (category);
CREATE INDEX idx_items_created_at ON items (created_at DESC);
CREATE INDEX idx_items_metadata_gin ON items USING GIN (metadata);

INSERT INTO collections (name, description)
VALUES ('Default', 'MVP default collection for new items');
