-- Replace beta_keys with UUID id, plaintext key, and claimed-at-unlock flag.
-- Registration consumes the row (DELETE) after user creation when beta access is required.
DROP TABLE IF EXISTS beta_keys;

CREATE TABLE beta_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    claimed BOOLEAN NOT NULL DEFAULT FALSE
);
