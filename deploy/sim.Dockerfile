# The simulator (AYK-250) as a container for the server: the app code, the simulator page, and the
# one client library the simulated phones use. Built from the repo root by deploy/install-simulator.sh.
FROM node:22-bookworm-slim
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN npm --prefix server ci --omit=dev --no-audit --no-fund && npm cache clean --force
# simulator/engine.js loads socket.io-client from client/ (the same version the real client ships).
RUN mkdir client && printf '{"name":"sim-client","private":true}\n' > client/package.json \
    && npm --prefix client install --no-audit --no-fund --save-exact socket.io-client@4.8.4 && npm cache clean --force
COPY server server
COPY database database
COPY simulator simulator
RUN mkdir -p server/uploads simulator/runs && chown -R node:node server/uploads simulator/runs
ENV SIM_HOST=0.0.0.0 SIM_PORT=4600 SIM_TRUST_PROXY=1
USER node
EXPOSE 4600
CMD ["node", "simulator/sim.js"]
