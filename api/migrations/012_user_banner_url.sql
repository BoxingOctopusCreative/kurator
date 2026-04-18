-- Optional wide image shown at the top of public profile pages.
ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_url TEXT;
