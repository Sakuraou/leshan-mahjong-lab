FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/client-core/package.json packages/client-core/package.json
RUN npm ci --omit=dev

COPY src ./src
COPY packages/client-core ./packages/client-core

RUN chown -R node:node /app
USER node

EXPOSE 8787
CMD ["node", "--experimental-strip-types", "src/server/productionServer.ts"]
