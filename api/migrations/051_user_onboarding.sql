-- New-user onboarding progress (existing accounts with shelves are backfilled as complete).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0;

-- Anyone who already has at least one shelf should never see onboarding.
UPDATE users u
SET onboarding_completed = TRUE,
    onboarding_step = 5
WHERE onboarding_completed = FALSE
  AND (
    EXISTS (SELECT 1 FROM collections c WHERE c.user_id = u.id)
    OR EXISTS (SELECT 1 FROM wishlists w WHERE w.user_id = u.id)
    OR EXISTS (SELECT 1 FROM lists l WHERE l.user_id = u.id)
  );
