-- Public profile URL handle and visibility (default: public).
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_is_public BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE users
SET username = 'user-' || id::text
WHERE username IS NULL OR trim(username) = '';

ALTER TABLE users ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));
