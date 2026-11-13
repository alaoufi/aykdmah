-- -----------------------------------------------------
-- Migration 063: "My directory" as a contact book (AYK-109)
--
-- Anyone can keep a contact (a provider, or someone they already chat with) under a
-- name they choose, then message or call them from the directory.
--
-- Rollback:
--   ALTER TABLE saved_providers DROP COLUMN IF EXISTS nickname;
-- -----------------------------------------------------

ALTER TABLE saved_providers ADD COLUMN IF NOT EXISTS nickname VARCHAR(80) NULL DEFAULT NULL;
