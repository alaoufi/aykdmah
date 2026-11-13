# API server for aykdmh.com. The client is built separately and served by Caddy.
FROM node:22-bookworm-slim
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN npm --prefix server ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server server
COPY database database
RUN mkdir -p server/uploads && chown node:node server/uploads
ENV NODE_ENV=production APP_PORT=5000
USER node
EXPOSE 5000
CMD ["node", "server/server.js"]
