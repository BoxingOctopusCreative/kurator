-- Allow comic book and manga item categories.
ALTER TABLE items
    DROP CONSTRAINT IF EXISTS items_category_check;

ALTER TABLE items
    ADD CONSTRAINT items_category_check CHECK (
        category IN (
            'game',
            'music',
            'book',
            'video',
            'comic_book',
            'manga'
        )
    );
