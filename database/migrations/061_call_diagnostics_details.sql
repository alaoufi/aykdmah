-- -----------------------------------------------------
-- Migration 061: what each side of a call really sent and received (AYK-093)
--
-- A short JSON per participant: its published tracks, the other side's tracks
-- (subscribed, muted), whether the call's audio element played, and the names of
-- any capture errors. Numbers and names only, never media.
--
-- Rollback:
--   ALTER TABLE call_diagnostics DROP COLUMN IF EXISTS details;
-- -----------------------------------------------------

ALTER TABLE call_diagnostics ADD COLUMN IF NOT EXISTS details VARCHAR(600) NULL DEFAULT NULL;
