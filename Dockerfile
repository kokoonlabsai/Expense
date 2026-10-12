FROM node:22-slim AS build
WORKDIR /app
COPY client/package*.json client/
RUN npm --prefix client ci
COPY client client
RUN npm --prefix client run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=4000 DB_PATH=/data/tally.db
COPY server/package*.json server/
RUN npm --prefix server ci --omit=dev
COPY server server
COPY --from=build /app/client/dist client/dist
VOLUME /data
EXPOSE 4000
CMD ["node", "server/src/index.js"]
