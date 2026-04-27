-- Store SHA-256 (hex) of the UTF-8 key only; plaintext keys are never persisted.
DROP TABLE IF EXISTS beta_keys;

CREATE TABLE beta_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash TEXT NOT NULL UNIQUE,
    claimed BOOLEAN NOT NULL DEFAULT FALSE
);
