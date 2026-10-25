# BUILD
FROM node:26-alpine as builder

WORKDIR /opt/src

RUN apk add --no-cache bash git python3 perl alpine-sdk

COPY storywriter-server storywriter-server

RUN cd storywriter-server && \
    npm ci && \
    npm run build

COPY storywriter-web storywriter-web

RUN cd storywriter-web && \
    npm ci && \
    npm run generate

# Trim the server dependencies down to the production set before copying them
# into the runtime image (dev tooling like Jest/TypeScript/oxlint stays out).
RUN cd storywriter-server && \
    npm prune --omit=dev

# RUN
FROM node:26-alpine

RUN apk add --no-cache gzip \
 && addgroup -g 1000 -S storywriter \
 && adduser -u 1000 -S -G storywriter storywriter \
 && mkdir -p /opt/app/storywriter \
 && chown -R storywriter:storywriter /opt/app/storywriter

COPY --from=builder /opt/src/storywriter-server/node_modules /opt/app/storywriter/node_modules
COPY --from=builder /opt/src/storywriter-server/dist /opt/app/storywriter/dist
COPY --from=builder /opt/src/storywriter-web/.output/public /opt/app/storywriter/web
COPY storywriter-server/config.json /opt/app/storywriter/config.json
COPY storywriter-server/sql /opt/app/storywriter/sql
COPY package.json /opt/app/storywriter/package.json

WORKDIR /opt/app/storywriter

USER storywriter

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:8080/api/status || exit 1

CMD [ "dist/App.js" ]
