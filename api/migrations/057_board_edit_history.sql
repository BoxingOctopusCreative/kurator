-- Snapshots of thread/reply content before each edit (for owner/mod audit).

CREATE TABLE board_thread_edits (
    id BIGSERIAL PRIMARY KEY,
    thread_id UUID NOT NULL REFERENCES board_threads (id) ON DELETE CASCADE,
    editor_user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_board_thread_edits_thread_created
    ON board_thread_edits (thread_id, created_at DESC);

CREATE TABLE board_reply_edits (
    id BIGSERIAL PRIMARY KEY,
    reply_id UUID NOT NULL REFERENCES board_replies (id) ON DELETE CASCADE,
    editor_user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_board_reply_edits_reply_created
    ON board_reply_edits (reply_id, created_at DESC);
