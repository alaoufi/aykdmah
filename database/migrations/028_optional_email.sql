-- Registration supports username or phone as the only identifier.
-- Keep the existing unique email constraint, but allow omitted emails.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
