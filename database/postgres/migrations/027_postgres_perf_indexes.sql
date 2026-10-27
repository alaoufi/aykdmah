-- Auto-generated from database/migrations/027_postgres_perf_indexes.sql
-- DO NOT EDIT — regenerate via 'NODE_ENV=test node scripts/dump-pg-sql.js'

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE users             ADD COLUMN IF NOT EXISTS geom geography(Point, 4326);

CREATE INDEX IF NOT EXISTS idx_users_geom              ON users USING GIST (geom);

ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS geom geography(Point, 4326);

CREATE INDEX IF NOT EXISTS idx_provider_profiles_geom  ON provider_profiles USING GIST (geom);

ALTER TABLE requests          ADD COLUMN IF NOT EXISTS geom geography(Point, 4326);

CREATE INDEX IF NOT EXISTS idx_requests_geom           ON requests USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_users_permissions       ON users USING GIN (permissions);

CREATE INDEX IF NOT EXISTS idx_countries_langs         ON countries USING GIN (languages_enabled);

CREATE INDEX IF NOT EXISTS idx_provider_profiles_svc   ON provider_profiles USING GIN (service_ids);

CREATE INDEX IF NOT EXISTS idx_provider_profiles_gal   ON provider_profiles USING GIN (gallery);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created   ON messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_offers_request          ON offers (request_id);

CREATE INDEX IF NOT EXISTS idx_offers_provider         ON offers (provider_id);

CREATE INDEX IF NOT EXISTS idx_requests_status         ON requests (status, created_at);

CREATE INDEX IF NOT EXISTS idx_requests_city           ON requests (city_id);

CREATE INDEX IF NOT EXISTS idx_users_role              ON users (role);

CREATE INDEX IF NOT EXISTS idx_users_country           ON users (country_id);

CREATE INDEX IF NOT EXISTS idx_conv_part_user          ON conversation_participants (user_id);

CREATE INDEX IF NOT EXISTS idx_location_shares_live    ON location_shares (is_live, expires_at);

CREATE INDEX IF NOT EXISTS idx_disputes_status         ON disputes (status, opened_at);
