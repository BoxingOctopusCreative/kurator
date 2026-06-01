-- Pro billing cadence (monthly vs annual), synced from Stripe subscription price.
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_interval TEXT NOT NULL DEFAULT '';
