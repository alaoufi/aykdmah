-- -----------------------------------------------------
-- Migration 065: when a message reached the other phone (AYK-122)
--
-- One tick: sent. Two grey ticks: it reached their phone (their app connected). Two blue
-- ticks: read, as before.
--
-- Rollback:
--   ALTER TABLE messages DROP COLUMN IF EXISTS delivered_at;
-- -----------------------------------------------------

ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP NULL DEFAULT NULL;
