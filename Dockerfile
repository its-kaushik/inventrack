# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts* ./
COPY src/ ./src/
COPY drizzle.config.ts ./
RUN npx tsup src/server.ts --format esm --dts --outDir dist

# Stage 2: Run
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/src/db/migrations ./src/db/migrations

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
