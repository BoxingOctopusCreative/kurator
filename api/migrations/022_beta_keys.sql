-- Private beta access keys: one key may be claimed by at most one user.
CREATE TABLE beta_keys (
    id BIGSERIAL PRIMARY KEY,
    -- SHA-256 (hex) of the UTF-8 key string for constant-time lookup
    key_fingerprint TEXT NOT NULL UNIQUE,
    user_id BIGINT REFERENCES users (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_beta_keys_one_user_per_key ON beta_keys (user_id) WHERE user_id IS NOT NULL;
