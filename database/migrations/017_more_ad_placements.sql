-- -----------------------------------------------------
-- Migration 017: open up the ad placements catalog
--
-- The original ENUM restricted placement to 5 values. Switch to
-- VARCHAR so we can add new spots (services pages, request detail,
-- chat sidebar, etc.) without an ALTER TABLE every time. The set
-- of recognised values lives in code (server placements catalog).
-- -----------------------------------------------------

ALTER TABLE ads
  MODIFY COLUMN placement VARCHAR(40) NOT NULL DEFAULT 'home_top';
