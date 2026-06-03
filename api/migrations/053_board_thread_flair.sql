-- Board-defined flair tags and per-thread flair (set after posting).

CREATE TABLE board_flairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (board_id, label)
);

CREATE INDEX idx_board_flairs_board ON board_flairs (board_id, sort_order, label);

ALTER TABLE board_threads
    ADD COLUMN IF NOT EXISTS flair_id UUID NULL REFERENCES board_flairs (id) ON DELETE SET NULL;

CREATE INDEX idx_board_threads_flair ON board_threads (flair_id) WHERE flair_id IS NOT NULL;
