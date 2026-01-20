# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Production stage
FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist
COPY vite.config.ts ./

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "preview", "--host", "0.0.0.0"]
