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

# RUN
FROM node:26-alpine

RUN apk add --no-cache gzip

COPY --from=builder /opt/src/storywriter-server/node_modules /opt/app/storywriter/node_modules
COPY --from=builder /opt/src/storywriter-server/dist /opt/app/storywriter/dist
COPY --from=builder /opt/src/storywriter-web/.output/public /opt/app/storywriter/web
COPY storywriter-server/config.json /opt/app/storywriter/config.json
COPY storywriter-server/sql /opt/app/storywriter/sql
COPY package.json /opt/app/storywriter/package.json

WORKDIR /opt/app/storywriter

CMD [ "dist/App.js" ]
