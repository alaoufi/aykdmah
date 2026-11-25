-- AYK-499: a read-only PostgreSQL role for Metabase (reports and dashboards).
-- Run by deploy/install-metabase.sh as the database owner, with :report_password given by the script.
-- Design: the role can only SELECT, and only the tables and columns listed here.
-- Never granted (secrets or personal data): users.password_hash, email, phone, whatsapp_number, latitude/longitude,
-- permissions, session versions, tokens; withdrawal_requests (IBAN); verification_otps; push tokens; messages and
-- chat files; support messages; disputes; security_events; settings (may hold keys); api_integrations.
-- Rollback: DROP OWNED BY aykdmah_report; DROP ROLE aykdmah_report;  (deploy/remove-metabase.sh does it)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aykdmah_report') THEN
    CREATE ROLE aykdmah_report LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 8;
  END IF;
END $$;
ALTER ROLE aykdmah_report PASSWORD :'report_password';
ALTER ROLE aykdmah_report SET default_transaction_read_only = on;
ALTER ROLE aykdmah_report SET statement_timeout = '30s';

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM aykdmah_report;
GRANT CONNECT ON DATABASE aykdmah TO aykdmah_report;
GRANT USAGE ON SCHEMA public TO aykdmah_report;

-- Whole tables: money, plans and catalogue (no personal text).
GRANT SELECT (id, user_id, subscription_id, request_id, provider, amount, currency, payment_method, status, paid_at, refunded_at, created_at) ON payments TO aykdmah_report;  -- no metadata or gateway ids
GRANT SELECT ON wallet_transactions, referral_rewards, referral_count_rewards, subscriptions,
  subscription_plans, subscription_rules, provider_badges, categories, services, regions, governorates,
  cities, districts, countries, ad_campaigns, ad_stats_daily, visit_days, translation_usage TO aykdmah_report;

-- Requests, offers and reviews without free text of private conversations.
GRANT SELECT (id, client_id, category_id, service_id, status, is_urgent, city_id, district_id, budget_min, budget_max,
  assigned_provider_id, completed_at, cancelled_at, offers_count, views_count, created_at, updated_at, deleted_at,
  hidden_at, agreed_at) ON requests TO aykdmah_report;
GRANT SELECT (id, request_id, provider_id, price, status, accepted_at, rejected_at, created_at) ON offers TO aykdmah_report;

-- Accounts: counts and segmentation only. No name, contact data, location or credentials.
GRANT SELECT (id, role, is_active, is_blocked, is_verified, city_id, district_id, region_id, created_at,
  deleted_at, referred_by, also_client, ui_lang, is_online, last_login_at) ON users TO aykdmah_report;
GRANT SELECT (id, user_id, amount, status, wallet_transaction_id, processed_at, created_at) ON withdrawal_requests TO aykdmah_report;  -- no IBAN or account name
