-- Discussion boards: public communities or invite-only private boards (no voting).

CREATE TABLE boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_boards_owner ON boards (owner_user_id);
CREATE INDEX idx_boards_visibility ON boards (visibility);

CREATE TABLE board_members (
    board_id UUID NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (board_id, user_id)
);

CREATE INDEX idx_board_members_user ON board_members (user_id);

CREATE TABLE board_invites (
    id BIGSERIAL PRIMARY KEY,
    board_id UUID NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    inviter_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    invitee_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ NULL,
    CHECK (inviter_id <> invitee_id)
);

CREATE INDEX idx_board_invites_invitee_pending
    ON board_invites (invitee_id, status, created_at DESC)
    WHERE status = 'pending';

CREATE UNIQUE INDEX board_invites_one_pending_per_board_invitee
    ON board_invites (board_id, invitee_id)
    WHERE status = 'pending';

CREATE TABLE board_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_board_threads_board_created
    ON board_threads (board_id, created_at DESC);

CREATE TABLE board_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES board_threads (id) ON DELETE CASCADE,
    parent_reply_id UUID NULL REFERENCES board_replies (id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_board_replies_thread_created
    ON board_replies (thread_id, created_at ASC);
