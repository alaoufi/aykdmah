-- AYK-248: user media in Cloudflare R2 instead of the database (owner's decision 2026-11-17).
-- uploaded_media keeps every row's owner, scope and access rules; for R2 rows the bytes live in the
-- private bucket under object_key and data is NULL. Old rows stay in the database (storage 'db')
-- until scripts/media-to-r2 moves them. 'pending' rows are direct uploads (video clips, long voice
-- notes) whose bytes are not yet confirmed in R2; they are never readable and are cleaned up.
-- Sizes up to 100 MB (the video limit); the per-kind limits live in settings.
-- Additive: the earlier code reads only storage 'db' rows, which keep their data.
ALTER TABLE uploaded_media ADD COLUMN IF NOT EXISTS storage VARCHAR(4) NOT NULL DEFAULT 'db';
ALTER TABLE uploaded_media ADD COLUMN IF NOT EXISTS object_key VARCHAR(200) DEFAULT NULL;
ALTER TABLE uploaded_media ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'ready';
ALTER TABLE uploaded_media ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT NULL;
ALTER TABLE uploaded_media ALTER COLUMN data DROP NOT NULL;

DO $$
DECLARE
  size_column SMALLINT;
  data_column SMALLINT;
  old_constraint RECORD;
BEGIN
  SELECT attnum INTO STRICT size_column FROM pg_attribute
    WHERE attrelid = 'uploaded_media'::regclass AND attname = 'size' AND NOT attisdropped;
  SELECT attnum INTO STRICT data_column FROM pg_attribute
    WHERE attrelid = 'uploaded_media'::regclass AND attname = 'data' AND NOT attisdropped;
  -- Only the old 4 MB size check and the data length check; the scope check stays.
  FOR old_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'uploaded_media'::regclass AND contype = 'c'
      AND conkey && ARRAY[size_column, data_column]
      AND conname NOT IN ('uploaded_media_size_limit_check', 'uploaded_media_storage_check')
  LOOP
    EXECUTE format('ALTER TABLE uploaded_media DROP CONSTRAINT %I', old_constraint.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'uploaded_media'::regclass AND conname = 'uploaded_media_size_limit_check') THEN
    ALTER TABLE uploaded_media ADD CONSTRAINT uploaded_media_size_limit_check CHECK (size > 0 AND size <= 104857600);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'uploaded_media'::regclass AND conname = 'uploaded_media_storage_check') THEN
    ALTER TABLE uploaded_media ADD CONSTRAINT uploaded_media_storage_check CHECK (
      status IN ('pending', 'ready')
      AND ((storage = 'db' AND data IS NOT NULL AND octet_length(data) = size AND object_key IS NULL)
        OR (storage = 'r2' AND data IS NULL AND object_key IS NOT NULL)));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_uploaded_media_pending ON uploaded_media (created_at) WHERE status = 'pending';

-- Per-kind limits shown to users ("up to 3 minutes or 100 MB"); the owner changes them in settings.
INSERT INTO settings (setting_key, setting_value, setting_type, setting_group, is_public, description) VALUES
  ('media_video_max_mb', '100', 'number', 'files', 1, 'أقصى حجم لمقطع الفيديو في المحادثة (ميجابايت)'),
  ('media_video_max_seconds', '180', 'number', 'files', 1, 'أقصى مدة لمقطع الفيديو (ثانية)'),
  ('media_voice_max_mb', '20', 'number', 'files', 1, 'أقصى حجم للرسالة الصوتية أو المقطع الصوتي (ميجابايت)'),
  ('media_voice_max_seconds', '600', 'number', 'files', 1, 'أقصى مدة للرسالة الصوتية المسجلة (ثانية)'),
  ('media_image_max_mb', '10', 'number', 'files', 1, 'أقصى حجم للصورة (ميجابايت)'),
  ('media_file_max_mb', '20', 'number', 'files', 1, 'أقصى حجم للملف أو المستند (ميجابايت)')
ON CONFLICT (setting_key) DO NOTHING;
