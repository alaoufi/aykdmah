# Current Coolify hosting — AYK-201

The owner authorized organizing both public websites in Coolify. The existing
frontend runs as a separate Service; API/PostgreSQL/LiveKit and published assets
retain the same containers, images and files. No new application version was deployed.

Canonical site rules: deploy/caddy/aykdmh-site.Caddyfile. Runtime copy is kept in
/etc/aykdmh/coolify-site/Caddyfile. Shared TLS/TURN ingress: deploy/caddy/Caddyfile.
Only the frontend owns static caching, CSP, privacy rules and API/LiveKit HTTP paths.
The ingress keeps the native TURN/TLS listener and domains for both websites.
The frontend preserves the resolved client IP as one forwarded value and HTTPS,
matching the existing backend's TRUST_PROXY=1 contract.

Resource controls live in the existing Coolify account. Image source is the exact
pre-adoption local Caddy image. Do not Pull Latest for local-only images. Before a
site-rule update, back up, validate Caddy, replace its runtime copy, restart only the
Coolify frontend and compare root/version/API/privacy/LiveKit behavior. Do not restart
PostgreSQL or LiveKit for a frontend change. Rollback ingress and encrypted DB/config
backup are held privately on the server; never put environment values into Git.

Legacy setup-server.sh now refuses before any mutation when Coolify frontend routing
is present. A future application release needs a reviewed backend/client release
procedure that preserves the shared ingress; do not remove that guard to deploy.
Do not infer that current Git HEAD is the published app: live version remained1.1.11
and build e91dc41 while checkout was FF-updated to the authoritative newer source.

Cross-site infrastructure templates/report are also in alaoufi/aser docs/COOLIFY.md.
Browser/HTTP parity checks do not prove physical-phone call quality or faster response.

## Application releases (AYK-206)

`bash deploy/release-app.sh` (root, from /opt/aykdmh after a fast-forward pull) is the reviewed
release procedure: database backup, new client release in /var/www/aykdmh/releases, API image,
migrations, API container, then the /var/www/aykdmh/current switch the Coolify frontend serves.
It leaves Coolify, the shared ingress (aykdmh-web), LiveKit, secrets and the firewall untouched.
