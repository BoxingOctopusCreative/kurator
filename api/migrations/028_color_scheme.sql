ALTER TABLE users
    ADD COLUMN IF NOT EXISTS color_scheme TEXT NOT NULL DEFAULT 'default',
    ADD COLUMN IF NOT EXISTS accessible_color_schemes_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_color_scheme_check;

ALTER TABLE users
    ADD CONSTRAINT users_color_scheme_check CHECK (color_scheme IN (
        'default',
        'darcula',
        'catppuccin',
        'solarized',
        'accessible_okabe',
        'accessible_high_contrast'
    ));
