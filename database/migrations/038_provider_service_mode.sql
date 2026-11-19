-- Expand the existing service-venue field without reassigning historical
-- provider modes or copying private user GPS into public work details.
-- New providers default to travelling to the customer; old rows stay intact.
-- Keep replacement of the old check and default atomic, including direct
-- migration execution outside the application's journaled runner.
DO $$
DECLARE
  mode_column SMALLINT;
  old_constraint RECORD;
BEGIN
  SELECT attnum INTO STRICT mode_column
  FROM pg_attribute
  WHERE attrelid = 'provider_profiles'::regclass
    AND attname = 'location_mode' AND NOT attisdropped;

  -- Legacy installations may have renamed the generated column check.
  -- Remove only checks for this one column and retain unrelated constraints.
  FOR old_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'provider_profiles'::regclass
      AND contype = 'c' AND conkey = ARRAY[mode_column]
  LOOP
    EXECUTE format('ALTER TABLE provider_profiles DROP CONSTRAINT %I', old_constraint.conname);
  END LOOP;

  ALTER TABLE provider_profiles ADD CONSTRAINT provider_profiles_location_mode_check
    CHECK (location_mode IN ('fixed', 'mobile', 'both'));
  ALTER TABLE provider_profiles ALTER COLUMN location_mode SET DEFAULT 'mobile';
END $$;
