# Build with the REPO ROOT as context (the server imports ../src/economy etc.):
#   docker build -f server/Dockerfile -t dog-territory-api .
FROM node:22-alpine AS build
WORKDIR /repo
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci
COPY server ./server
COPY src ./src
RUN cd server && npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=256 \
    PORT=7000 \
    READY_PORT=7100
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /repo/server/dist ./dist
COPY server/drizzle ./drizzle
USER node
EXPOSE 7000
# busybox wget ships with alpine; /readyz lives on the internal READY_PORT listener only.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:${READY_PORT}/readyz || exit 1
CMD ["node", "dist/index.js"]
