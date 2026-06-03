-- Board moderators: owners appoint users who may delete threads and replies.

CREATE TABLE board_moderators (
    board_id UUID NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (board_id, user_id)
);

CREATE INDEX idx_board_moderators_user ON board_moderators (user_id);
