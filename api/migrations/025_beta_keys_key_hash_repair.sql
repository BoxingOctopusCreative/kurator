-- Repair beta_keys when the database applied 023 (plaintext `key`) but not 024 (`key_hash`),
-- or the table was restored from an older snapshot. Matches Go service.BetaKeyHash (SHA-256 hex of UTF-8 trim).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $kurator_beta_keys_migrate$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'beta_keys' AND column_name = 'key_hash'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'beta_keys' AND column_name = 'key'
  ) THEN
    ALTER TABLE beta_keys ADD COLUMN key_hash TEXT;
    UPDATE beta_keys
    SET key_hash = encode(digest(convert_to(BTRIM(key), 'UTF8'), 'sha256'), 'hex');
    ALTER TABLE beta_keys ALTER COLUMN key_hash SET NOT NULL;
    ALTER TABLE beta_keys DROP COLUMN key;
    ALTER TABLE beta_keys DROP CONSTRAINT IF EXISTS beta_keys_key_hash_key;
    ALTER TABLE beta_keys ADD CONSTRAINT beta_keys_key_hash_key UNIQUE (key_hash);
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'beta_keys' AND column_name = 'key_fingerprint'
  ) THEN
    DROP TABLE beta_keys;
    CREATE TABLE beta_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key_hash TEXT NOT NULL UNIQUE,
      claimed BOOLEAN NOT NULL DEFAULT FALSE
    );
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'beta_keys'
  ) THEN
    DROP TABLE beta_keys;
    CREATE TABLE beta_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key_hash TEXT NOT NULL UNIQUE,
      claimed BOOLEAN NOT NULL DEFAULT FALSE
    );
  END IF;
END
$kurator_beta_keys_migrate$;
