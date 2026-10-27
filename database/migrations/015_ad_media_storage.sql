-- -----------------------------------------------------
-- Migration 015: store ad media inside the database
--
-- Container and read-only filesystems make multer's disk storage fail
-- with ENOENT. Putting the raw bytes
-- on a row keeps the upload path portable across hosts.
--
-- The `ads.image` column keeps being the public URL; for db-stored
-- files we point it at /api/ads/media/:id so the rest of the stack
-- doesn't have to know where the bytes live.
-- -----------------------------------------------------

CREATE TABLE IF NOT EXISTS ad_media (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mime VARCHAR(80) NOT NULL,
  size INT NOT NULL,
  filename VARCHAR(200) DEFAULT NULL,
  data LONGBLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
