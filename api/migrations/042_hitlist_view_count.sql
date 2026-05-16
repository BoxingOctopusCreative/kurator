-- Track approximate hitlist page views for discover / "most active" sorts.

ALTER TABLE lists
    ADD COLUMN IF NOT EXISTS view_count BIGINT NOT NULL DEFAULT 0;
