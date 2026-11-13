-- -----------------------------------------------------
-- Migration 014: ads support animated images + video
--
-- The existing `image` column keeps holding the public media URL.
-- A new `media_type` column tells the renderer whether to use an
-- <img> tag (jpeg/png/webp/gif/apng/animated-webp) or a <video>
-- tag (mp4/webm/ogg).
-- -----------------------------------------------------

ALTER TABLE ads
  ADD COLUMN IF NOT EXISTS media_type ENUM('image','video') NOT NULL DEFAULT 'image' AFTER image;
