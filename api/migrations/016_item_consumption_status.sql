-- Per-item consumption state (UI labels depend on category).
ALTER TABLE items
    ADD COLUMN consumption_status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT items_consumption_status_check CHECK (consumption_status IN ('pending', 'done'));

CREATE INDEX IF NOT EXISTS idx_items_collection_consumption
    ON items (collection_id, consumption_status);
