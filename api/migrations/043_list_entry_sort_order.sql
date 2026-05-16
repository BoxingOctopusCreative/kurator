-- Deterministic hitlist entry order (drag-and-drop). Preserves prior display order (newest first).

ALTER TABLE list_entries
    ADD COLUMN IF NOT EXISTS sort_order INTEGER;

UPDATE list_entries le
SET sort_order = sub.rn
FROM (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY list_id
            ORDER BY
                created_at DESC
        ) - 1 AS rn
    FROM list_entries
) sub
WHERE le.id = sub.id;

ALTER TABLE list_entries
    ALTER COLUMN sort_order SET NOT NULL;

ALTER TABLE list_entries
    ALTER COLUMN sort_order SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_list_entries_list_sort ON list_entries (list_id, sort_order);
