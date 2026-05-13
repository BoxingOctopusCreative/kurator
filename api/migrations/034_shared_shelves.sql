-- Shared shelves: optional collaboration with explicit members and pending join/invite requests.

ALTER TABLE collections
    ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE lists
    ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE wishlists
    ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS shelf_members (
    shelf_kind TEXT NOT NULL CHECK (shelf_kind IN ('collection', 'list', 'wishlist')),
    shelf_id UUID NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (shelf_kind, shelf_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_shelf_members_user_id ON shelf_members (user_id);

CREATE TABLE IF NOT EXISTS shelf_access_requests (
    id BIGSERIAL PRIMARY KEY,
    shelf_kind TEXT NOT NULL CHECK (shelf_kind IN ('collection', 'list', 'wishlist')),
    shelf_id UUID NOT NULL,
    flow TEXT NOT NULL CHECK (flow IN ('join_request', 'invite')),
    requester_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    recipient_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ NULL,
    CHECK (requester_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_shelf_access_requests_recipient
    ON shelf_access_requests (recipient_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shelf_access_requests_shelf
    ON shelf_access_requests (shelf_kind, shelf_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS shelf_access_one_pending_join
    ON shelf_access_requests (shelf_kind, shelf_id, requester_id)
    WHERE flow = 'join_request' AND status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS shelf_access_one_pending_invite
    ON shelf_access_requests (shelf_kind, shelf_id, recipient_id)
    WHERE flow = 'invite' AND status = 'pending';

CREATE OR REPLACE FUNCTION trg_cleanup_shelf_share_collection()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM shelf_members WHERE shelf_kind = 'collection' AND shelf_id = OLD.id;
    DELETE FROM shelf_access_requests WHERE shelf_kind = 'collection' AND shelf_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS collections_delete_shelf_share ON collections;
CREATE TRIGGER collections_delete_shelf_share
    BEFORE DELETE ON collections
    FOR EACH ROW
    EXECUTE PROCEDURE trg_cleanup_shelf_share_collection();

CREATE OR REPLACE FUNCTION trg_cleanup_shelf_share_list()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM shelf_members WHERE shelf_kind = 'list' AND shelf_id = OLD.id;
    DELETE FROM shelf_access_requests WHERE shelf_kind = 'list' AND shelf_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lists_delete_shelf_share ON lists;
CREATE TRIGGER lists_delete_shelf_share
    BEFORE DELETE ON lists
    FOR EACH ROW
    EXECUTE PROCEDURE trg_cleanup_shelf_share_list();

CREATE OR REPLACE FUNCTION trg_cleanup_shelf_share_wishlist()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM shelf_members WHERE shelf_kind = 'wishlist' AND shelf_id = OLD.id;
    DELETE FROM shelf_access_requests WHERE shelf_kind = 'wishlist' AND shelf_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wishlists_delete_shelf_share ON wishlists;
CREATE TRIGGER wishlists_delete_shelf_share
    BEFORE DELETE ON wishlists
    FOR EACH ROW
    EXECUTE PROCEDURE trg_cleanup_shelf_share_wishlist();
