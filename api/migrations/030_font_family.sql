ALTER TABLE users
    ADD COLUMN IF NOT EXISTS font_family TEXT NOT NULL DEFAULT 'default';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_font_family_check;

ALTER TABLE users
    ADD CONSTRAINT users_font_family_check CHECK (font_family IN (
        'default',
        'sans',
        'serif'
    ));
