-- -----------------------------------------------------
-- Migration 012: subscription plan search-ranking weight
--
-- search_priority controls where offers from a provider on this plan
-- appear in client-facing offer lists. Higher number → shown first.
--   0  (default)  : no boost
--   10           : small boost (e.g. Silver)
--   50           : medium boost (e.g. Gold)
--   100          : strong boost (e.g. Diamond)
--
-- This is separate from sort_order (which controls how plan cards
-- themselves stack on the pricing page).
-- -----------------------------------------------------

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS search_priority INT NOT NULL DEFAULT 0 AFTER sort_order;
