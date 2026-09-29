# Builds all of the floor's apps (apps/api, apps/cluster-agent) from one image. Which
# one a container runs is chosen at deploy time by overriding `command` — see deploy/chart.
# The image also holds the pipeline tool (packages/pipeline), which is not a service.
#
#   docker build -t floor .
#   docker run floor node apps/api/dist/index.js
#   docker run floor node apps/cluster-agent/dist/index.js
#   docker run floor node packages/pipeline/dist/cli.js
#
# Nothing here names a package. A written-out list drifted twice: five packages became seven,
# then nine, and the cluster agent crash-looped in a real cluster on a package the image did
# not hold. The workspaces are a fact npm already keeps, and `scripts/check-image.sh` asks the
# built image whether it can resolve each of them.

# Every workspace's package.json and nothing else, so `npm ci` below is a layer that changes
# only when a manifest does, without this file listing which manifests exist.
FROM node:22-slim AS manifests
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN find packages apps -mindepth 2 -type f ! -name package.json -delete

FROM node:22-slim AS build
WORKDIR /app

COPY --from=manifests /src/ ./
RUN npm ci

COPY packages packages
COPY apps apps
RUN npm run build

FROM node:22-slim AS prod-deps
WORKDIR /app

COPY --from=manifests /src/ ./
RUN npm ci --omit=dev

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ARG FLOOR_BUILD_SHA=dev
ENV FLOOR_BUILD_SHA=$FLOOR_BUILD_SHA

# The whole of packages and apps as they were built: their dist, their manifests, and the
# store's migrations, with no list to fall behind. Their sources ride along, which is a few
# hundred kilobytes beside node_modules.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages packages
COPY --from=build --chown=node:node /app/apps apps

USER node
EXPOSE 8080

CMD ["node", "apps/api/dist/index.js"]
