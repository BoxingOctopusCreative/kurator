-- Board hero banner and subreddit-style icon (user-uploaded or imported URLs).
ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS icon_url TEXT;
