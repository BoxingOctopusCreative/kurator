-- Split legal name into first and last with per-field visibility, drop legacy full_name column, username lock for placeholders.
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_locked BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE users
SET
    first_name = COALESCE(NULLIF(BTRIM(full_name), ''), ''),
    last_name = ''
WHERE EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'full_name'
);

UPDATE users
SET username_locked = FALSE
WHERE username ~ '^user-[0-9]+$';

ALTER TABLE users DROP COLUMN IF EXISTS full_name;
