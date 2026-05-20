-- One linked Google (or Discord) account per Kurator user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_identities_user_provider
    ON oauth_identities (user_id, provider);
