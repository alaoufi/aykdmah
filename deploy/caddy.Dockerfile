# Caddy with the layer4 module (AYK-051): lets call traffic (TURN over TLS) share port 443
# with the website. Versions pinned together: caddy-l4 v0.1.2 requires Caddy v2.11.4.
FROM caddy:2.11.4-builder-alpine AS build
RUN xcaddy build v2.11.4 --with github.com/mholt/caddy-l4@v0.1.2

FROM caddy:2.11.4-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
