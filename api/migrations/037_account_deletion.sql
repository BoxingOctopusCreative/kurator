-- Account deactivation (30-day grace) and shared-shelf ownership succession.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
        CHECK (account_status IN ('active', 'deactivated'));

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS purge_scheduled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_account_purge
    ON users (purge_scheduled_at)
    WHERE account_status = 'deactivated' AND purge_scheduled_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_reactivation_tokens (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_reactivation_tokens_user
    ON account_reactivation_tokens (user_id);

CREATE TABLE IF NOT EXISTS shelf_ownership_successions (
    id                 BIGSERIAL PRIMARY KEY,
    shelf_kind         TEXT NOT NULL CHECK (shelf_kind IN ('collection', 'list', 'wishlist')),
    shelf_id           UUID NOT NULL,
    outgoing_owner_id  BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    mode               TEXT NOT NULL CHECK (mode IN ('sole_takeover', 'election')),
    status             TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'resolved', 'cancelled')),
    new_owner_id       BIGINT REFERENCES users (id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS shelf_ownership_succession_one_pending
    ON shelf_ownership_successions (shelf_kind, shelf_id)
    WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS shelf_ownership_election_votes (
    succession_id BIGINT NOT NULL REFERENCES shelf_ownership_successions (id) ON DELETE CASCADE,
    voter_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    candidate_id  BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (succession_id, voter_id)
);
