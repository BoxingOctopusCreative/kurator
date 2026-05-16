-- Per-hitlist choice: show ordered entry numbers (default) vs unordered presentation.

ALTER TABLE lists
    ADD COLUMN IF NOT EXISTS entries_numbered BOOLEAN NOT NULL DEFAULT TRUE;
