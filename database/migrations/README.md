# Database migrations

The application uses PostgreSQL. The base schema and older migrations retain some MySQL syntax; `server/services/installService.js` translates those statements. `database/postgres/` contains generated PostgreSQL equivalents. Regenerate them with `NODE_ENV=test node scripts/dump-pg-sql.js` after editing source SQL.

Initial installation applies `database/schema.sql`, `database/seed.sql`, and every numbered migration. The migration runner holds an advisory lock, records successful migrations in `schema_migrations`, and stops on required schema errors. Ordinary application deployments must apply pending migrations before accepting traffic. Existing journal entries and application records must be preserved.

`database/postgres/RUN-ME.sql` is an alternative **fresh database bootstrap only**. It runs inside one transaction, refuses a schema containing any application table, applies all migrations, and records their filenames. Run pending migrations through the application migration command when upgrading an existing database. Do not paste bootstrap SQL over an installed database or delete its migration journal.

Migration `026` only preserves legacy administrators' access when first introducing `is_super_admin`; rerunning it cannot elevate current limited administrators. Catalog repairs `002` and `009` preserve existing names and activation decisions. Migration `030` intentionally applies launch coverage and pricing once, so its journal entry must be retained. Geography migration `031` is additive, uses application-generated IDs, and preserves existing city/district names and activation flags. See [the geography source notice](../geography/SOURCE.md) for data coverage and licensing.

Migration `036` adds `NOT VALID` checks and foreign keys: it preserves historical rows while enforcing security-sensitive integrity on new writes. Existing dirty records need explicit repair before separately validating these constraints. No identity data is deleted or rewritten, and normalized email/phone uniqueness must be enforced by the application's serialized identity-write path until legacy duplicates can be safely reconciled.

Migration `037` changes the exact default site name and installation label from `RYZA` to `RIZA`, plus the platform-owned worker plan's exact default description. It preserves custom branding, setting metadata, plan IDs/slugs, installation details and all account data. Earlier migration files and journal entries remain unchanged.

Migration `038` expands the existing provider `location_mode` to `fixed` (customer visits the provider), `mobile` (provider travels to the customer), or `both` (agreed for each job). It replaces legacy checks for that column and changes the default for new profiles to `mobile` atomically, without rewriting any existing profile or work address. Apply it before deploying service-mode signup and editing.

Migration `039` adopts the supplied **خدمات أوتاد / AWTAD SERVICES** identity by replacing only exact previous platform defaults in the site name, installation label and worker plan description. Existing custom labels, sender settings and all accounts are preserved.

Migration `040` fills missing Urdu, Hindi and Bengali names for the 27 original categories and 111 service labels from the base seed and catalog extensions. It matches the original slug and Arabic/English names, preserves administrator translations and custom labels, and leaves IDs, activation, category assignments and account data untouched. The client also includes native reference names for all 386 launch-area district rows, guarded by their original Arabic/English name pair.

For new migrations, use the next numbered filename, prefer additive changes, use `IF NOT EXISTS`/`IF EXISTS` where appropriate, and test fresh installation, a journaled rerun, and preservation of existing application records. Required failures must never be treated as optional. Only the explicitly scoped PostGIS extension/geography/index statements may be skipped when PostGIS is unavailable.
