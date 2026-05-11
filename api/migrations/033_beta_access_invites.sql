-- Email-based private beta: request → admin approve → user link → registration for that email only.
CREATE TABLE beta_access_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_email TEXT NOT NULL,
    admin_token_hash TEXT NOT NULL UNIQUE,
    user_token_hash TEXT UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'consumed')),
    user_token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ
);

CREATE INDEX idx_beta_access_invites_pending_email
    ON beta_access_invites (lower(requester_email))
    WHERE status = 'pending';

CREATE INDEX idx_beta_access_invites_user_token
    ON beta_access_invites (user_token_hash)
    WHERE status = 'approved';
