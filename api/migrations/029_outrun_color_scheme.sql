-- Add retrowave / outrun palette id (light + dark tokens are CSS-side via theme class).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_color_scheme_check;

ALTER TABLE users
    ADD CONSTRAINT users_color_scheme_check CHECK (color_scheme IN (
        'default',
        'darcula',
        'catppuccin',
        'solarized',
        'outrun',
        'accessible_okabe',
        'accessible_high_contrast'
    ));
