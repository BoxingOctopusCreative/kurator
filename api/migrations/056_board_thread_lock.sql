-- Thread lock: board owners and moderators can prevent further replies.

ALTER TABLE board_threads
    ADD COLUMN locked_at TIMESTAMPTZ NULL,
    ADD COLUMN locked_by_user_id BIGINT NULL REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX idx_board_threads_locked ON board_threads (board_id) WHERE locked_at IS NOT NULL;
