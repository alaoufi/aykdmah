-- PostgreSQL performance indexes. The migration runner may skip only the
-- explicitly scoped optional PostGIS extension/geography/GiST statements when
-- that extension is unavailable. Required tables, JSONB indexes and ordinary
-- indexes must succeed before this migration is recorded.
--
-- What this unlocks:
--   • PostGIS geography(Point,4326) + GiST index on every table where
--     we run "nearby" queries. ST_DWithin is orders of magnitude faster
--     than the JS-side haversine fallback once we have real volume.
--   • GIN indexes on JSONB columns so `WHERE permissions ? 'admins.manage'`
--     and `WHERE languages_enabled ? 'ar'` aren't sequential scans.
--   • BTree composites on the FK + filter combos every page load hits.

-- PostGIS extension. Supabase ships with it; no-op when already present.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Geo columns + spatial GiST indexes (skipped gracefully if PostGIS
-- isn't available — undefined_object error code 42704 is tolerated).
ALTER TABLE users             ADD COLUMN IF NOT EXISTS geom geography(Point, 4326);
CREATE INDEX IF NOT EXISTS idx_users_geom              ON users USING GIST (geom);

ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS geom geography(Point, 4326);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_geom  ON provider_profiles USING GIST (geom);

ALTER TABLE requests          ADD COLUMN IF NOT EXISTS geom geography(Point, 4326);
CREATE INDEX IF NOT EXISTS idx_requests_geom           ON requests USING GIST (geom);

-- GIN indexes on the JSONB columns we actually query against.
CREATE INDEX IF NOT EXISTS idx_users_permissions       ON users USING GIN (permissions);
CREATE INDEX IF NOT EXISTS idx_countries_langs         ON countries USING GIN (languages_enabled);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_svc   ON provider_profiles USING GIN (service_ids);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_gal   ON provider_profiles USING GIN (gallery);

-- BTree indexes on the FK + filter combinations the app hits on
-- every list page. The MySQL inline KEY/INDEX declarations got
-- stripped by the translator; this restores the perf-critical ones.
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
