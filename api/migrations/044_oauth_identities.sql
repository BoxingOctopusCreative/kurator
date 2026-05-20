-- OAuth sign-in: nullable password for provider-only accounts; linked provider identities.
ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE oauth_identities (
    id                BIGSERIAL PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider          TEXT NOT NULL CHECK (provider IN ('google', 'discord')),
    provider_user_id  TEXT NOT NULL,
    provider_email    TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_user_id)
);

CREATE INDEX idx_oauth_identities_user_id ON oauth_identities (user_id);
