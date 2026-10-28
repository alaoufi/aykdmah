-- -----------------------------------------------------
-- Migration 053: the six new languages (AYK-037) in the Gulf countries' language list
--
-- Countries that offered the five worker languages also get Malayalam, Filipino,
-- Indonesian, Nepali, Amharic and Turkish, ordered by how common they are among
-- service providers. Countries with their own custom list are left untouched.
--
-- Rollback:
--   UPDATE countries SET languages_enabled = '["ar","en","ur","bn","hi"]'
--    WHERE languages_enabled = '["ar","ur","hi","bn","ml","fil","id","ne","am","tr","en"]';
-- -----------------------------------------------------

UPDATE countries SET languages_enabled = '["ar","ur","hi","bn","ml","fil","id","ne","am","tr","en"]'
 WHERE languages_enabled = '["ar","en","ur","bn","hi"]';
