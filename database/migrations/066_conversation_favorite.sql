-- -----------------------------------------------------
-- Migration 066: a favourite conversation (AYK-130)
--
-- ⭐ marks a chat as a favourite for this user only; favourites stay at the top of their list.
-- Saving the person in "My directory" is separate (📇).
--
-- Rollback:
--   ALTER TABLE conversation_participants DROP COLUMN IF EXISTS is_favorite;
-- -----------------------------------------------------

ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS is_favorite TINYINT(1) DEFAULT 0;
