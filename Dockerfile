ARG NODE_IMAGE=node
ARG NODE_VERSION=22

FROM ${NODE_IMAGE}:${NODE_VERSION}-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG SITE_URL=https://example.com
ENV SITE_URL=${SITE_URL}

RUN npm run build \
  && npm prune --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE}:${NODE_VERSION}-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    AVATAR_DIR=/data/avatars

WORKDIR /app

RUN mkdir -p /data/avatars \
  && chown -R node:node /data/avatars

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server/index.js"]
