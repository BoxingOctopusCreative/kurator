ALTER TABLE users DROP CONSTRAINT IF EXISTS users_font_family_check;

ALTER TABLE users
    ADD CONSTRAINT users_font_family_check CHECK (font_family IN (
        'default',
        'sans',
        'serif',
        'mono',
        'accessible_lexend',
        'accessible_atkinson',
        'accessible_opendyslexic'
    ));
