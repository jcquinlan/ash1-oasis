# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun build --target=bun --outfile=./dest/server.js ./src/index.ts

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 bookservice && \
    adduser --system --uid 1001 --gid 1001 bookservice

# Copy built application
COPY --from=builder /app/dest/server.js ./server.js
COPY --from=builder /app/package.json ./

# Create data directory for profiles
RUN mkdir -p /app/data/profiles && \
    chown -R bookservice:bookservice /app

# Switch to non-root user
USER bookservice

# Expose the port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun -e "fetch('http://localhost:3002/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the server
CMD ["bun", "run", "server.js"]
