# Builds all of the floor's apps (apps/api, apps/cluster-agent) from one image. Which
# one a container runs is chosen at deploy time by overriding `command` — see deploy/chart.
#
#   docker build -t floor .
#   docker run floor node apps/api/dist/index.js
#   docker run floor node apps/cluster-agent/dist/index.js

FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/assembly-lines/package.json packages/assembly-lines/package.json
COPY packages/station/package.json packages/station/package.json
COPY packages/store/package.json packages/store/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/cluster-agent/package.json apps/cluster-agent/package.json
RUN npm ci

COPY packages packages
COPY apps apps
RUN npm run build

FROM node:22-slim AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/assembly-lines/package.json packages/assembly-lines/package.json
COPY packages/station/package.json packages/station/package.json
COPY packages/store/package.json packages/store/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/cluster-agent/package.json apps/cluster-agent/package.json
RUN npm ci --omit=dev

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages/assembly-lines/package.json packages/assembly-lines/package.json
COPY --from=build --chown=node:node /app/packages/assembly-lines/dist packages/assembly-lines/dist
COPY --from=build --chown=node:node /app/packages/store/package.json packages/store/package.json
COPY --from=build --chown=node:node /app/packages/store/dist packages/store/dist
COPY --from=build --chown=node:node /app/packages/store/migrations packages/store/migrations
COPY --from=build --chown=node:node /app/packages/station/package.json packages/station/package.json
COPY --from=build --chown=node:node /app/packages/station/dist packages/station/dist
COPY --from=build --chown=node:node /app/apps/api/package.json apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /app/apps/cluster-agent/package.json apps/cluster-agent/package.json
COPY --from=build --chown=node:node /app/apps/cluster-agent/dist apps/cluster-agent/dist

USER node
EXPOSE 8080

CMD ["node", "apps/api/dist/index.js"]
