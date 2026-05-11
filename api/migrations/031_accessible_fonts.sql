ALTER TABLE users
    ADD COLUMN IF NOT EXISTS accessible_fonts_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_font_family_check;

ALTER TABLE users
    ADD CONSTRAINT users_font_family_check CHECK (font_family IN (
        'default',
        'sans',
        'serif',
        'mono',
        'accessible_lexend',
        'accessible_atkinson'
    ));
