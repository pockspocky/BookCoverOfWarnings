# Build context is the repository root: the image copies both server/ and lib/.
FROM node:22-bookworm-slim
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
WORKDIR /app/server
RUN npm ci

WORKDIR /app
COPY lib ./lib
COPY server ./server
WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["npx", "tsx", "src/index.ts"]
