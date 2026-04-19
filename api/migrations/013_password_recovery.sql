-- Stores bcrypt hashes of short-lived 6-digit recovery codes (email password reset).
CREATE TABLE password_recovery_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_recovery_codes_user_expires ON password_recovery_codes (user_id, expires_at DESC);
