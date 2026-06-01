-- Stripe subscription billing (Kurator Pro).
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer_id
    ON users (stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL AND trim(stripe_customer_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_subscription_id
    ON users (subscription_id)
    WHERE subscription_id IS NOT NULL AND trim(subscription_id) <> '';
